# CLAUDE.md — Working rules for this repo

Read this before making changes. It captures decisions already made so they don't get re-litigated or accidentally reversed.

## Code style

- Beginner-friendly, readable code over clever code. No unnecessary abstractions.
- No comments explaining *what* code does — only *why*, when it's non-obvious (a security reason, a workaround, a subtle invariant).
- Don't add validation, error handling, or config for scenarios that can't happen yet. Don't build for hypothetical future requirements.
- Don't hardcode domain values we've explicitly deferred (e.g. staff role names like "Doctor"/"Nurse" — those come from the future dynamic AccessRole system, not an enum).

## Backend structure (layer-based, not feature-nested)

```
backend/
  app.ts          Express app: middleware, routes, central error handler
  server.ts       Startup only: dotenv.config() → connectToDatabase() → app.listen()
  config/         env.ts (all env var reads), db.ts, cors.ts, permissions.ts (the permission catalogue)
  models/         Mongoose schemas
  controllers/    HTTP req/res only — thin, no business logic
  domain/         Business logic (the "service" layer). Controllers call this.
  routes/         Route wiring: validator → middleware → controller
  middleware/     requireAuth, requirePortal, requirePermission
  validators/     Request-shape checks only (presence/type). Business rules live in domain/.
  utils/          hash, jwt, otp, email, refreshToken, password, httpError
  scripts/        One-off scripts (e.g. seedOwner.ts), not part of the running app
  tests/          vitest + supertest
```

Do not reintroduce a `src/` wrapper or a feature-nested `modules/` structure unless there's a strong technical reason — this was deliberately flattened.

## The dotenv-ordering trap (has bitten us twice — don't reintroduce it)

`dotenv.config()` must run before any other local import that reads `process.env` at module load time. Under CommonJS (`server.ts`, `scripts/*.ts`), imports execute in file order, so `dotenv.config()` must be the literal first lines. Under Vitest's real ESM (`tests/*.test.ts`), a test file's own imports are *fully evaluated* before any of that file's own statements run, so putting `dotenv.config()` first in a test file does **not** work — it must live in `tests/setup.ts` (a Vitest `setupFiles` entry), which runs as a separate step before the test module graph loads.

## Error handling

Every error a controller sees should end up as `next(err)`, flowing to the single central handler in `app.ts`. Two error shapes are recognized there and turned into clean JSON responses:
- `HttpError` (`utils/httpError.ts`) — thrown deliberately by validators/domain code, carries its own status code.
- `mongoose.Error.CastError` — thrown automatically by Mongoose whenever a client-supplied id isn't a valid ObjectId (e.g. `findById("not-an-id")`). Caught centrally and turned into a clean `400 "Invalid ID format."` — **don't** add per-route `mongoose.Types.ObjectId.isValid(...)` checks in validators for this; the one central handler already covers every route, present and future.

Anything else falls through to a generic `500` with the real error only logged server-side, never sent to the client.

## Security boundaries — non-negotiable

- **The backend is the authorization source of truth.** Never trust a frontend-supplied ID (e.g. `hospitalId`) without re-verifying it server-side against the database on every request that matters.
- The access JWT carries only `{ id, portal, hospitalId? }`. `portal`/`hospitalId` are *context*, not permissions — never put roles or permissions in the token. Every permission-sensitive read goes back to the database.
- Passwords and OTP codes are bcrypt-hashed. Refresh tokens are SHA-256-hashed (they're already high-entropy opaque strings, not low-entropy secrets — no need for bcrypt there).
- Refresh tokens: HttpOnly cookie, one cookie **name per portal** (`patient_refresh_token`, `hospital_refresh_token`, `owner_refresh_token`) — cookies aren't port-scoped, so a shared name would let one portal's login silently overwrite another's session in the same browser. Rotated on every refresh. Bound to the portal they were issued for.
- **Refresh tokens and OTPs live embedded on `User`** (`refreshTokens[]`, `registerOtp`, `resetOtp` in `models/user.model.ts`), not in separate collections — there is no `RefreshTokenModel`/`OtpModel` anymore. `registerOtp`/`resetOtp` are single overwritable slots (a new request just replaces the old one) and are cleared immediately on successful verification, not marked "used" and left to rot. **Never add a TTL index on either of these fields** — a TTL index deletes the *whole document* it's on when it fires, which for an embedded field on `User` means deleting the entire account. That's exactly why these aren't in their own collections with a TTL index anymore.
- **This embedding has a real concurrency cost — don't reintroduce it.** Because everything now lives on one `User` document, two requests for the same user can race to modify it. We hit this for real (a `VersionError` from Mongoose's optimistic-concurrency check, thrown by concurrent `/api/auth/refresh` calls — plausible any time, guaranteed under React StrictMode's double effect-invocation in dev). The fix, in `domain/auth.service.ts`:
  - **High-frequency paths** (`issueTokens`/`login`/`refreshSession`/`logout`/`rememberSelectedHospital`) use atomic MongoDB update operators (`$push`/`$pull`/`$set` via `UserModel.updateOne`), never a fetch→mutate→`.save()` cycle. A read-then-write-with-retry is *not* sufficient here even though it prevents crashes — under a genuine burst, several requests can each read the same snapshot, each correctly compute "still under the cap," and all successfully save in sequence, exceeding the cap anyway. Verified: 8 truly concurrent logins for one user still cap at exactly 3 with atomic operators; the retry-based version let it reach 6.
  - **Low-frequency paths** (register/verify-OTP/forgot-password/reset-password) use `withVersionRetry` — fetch, mutate, save, and retry on `VersionError` with a fresh re-fetch. This is fine here because a user isn't realistically firing concurrent requests at these; it wouldn't be fine for login/refresh.
  - If you add a new field or flow that touches `User.refreshTokens` or any other frequently-written field, use an atomic operator, not `.save()`.
- Max 3 concurrent refresh tokens per `(userId, portal)` (`MAX_REFRESH_TOKENS_PER_PORTAL` in `domain/auth.service.ts::issueTokens`), FIFO-evicted on the next login past the cap. **Scoped per portal, never globally per user** — one account can hold separate patient/hospital/owner sessions at once, so a global cap would let a new device login on one portal silently sign the user out of an unrelated portal. If you ever add a "log out other devices" feature, keep it scoped the same way.
- Portal isolation is strict: a session authenticated through one portal must never expose data, roles, or endpoints belonging to another portal, even for a user who holds multiple roles. Enforce with `requirePortal(...)`, not just frontend routing.
- **Permissions fail closed, always.** `requirePermission(...)` (`middleware/permission.middleware.ts`) resolves permissions fresh from the database on every request via `domain/permission.service.ts` — never cached, never read from the JWT. A missing/inactive `HospitalMembership`, a missing/inactive `AccessRole`, an `AccessRole` belonging to a different hospital than the current context, or any invalid permission data all resolve to *zero* permissions — never to unrestricted access. This means a permission change in MongoDB takes effect on the staff member's very next request, with no logout/login/refresh needed — that's a feature, not a caching bug to "fix" later.
- Only permission strings from the catalogue (`config/permissions.ts`) may ever be stored on an `AccessRole` — validated on creation, never arbitrary strings.
- `HospitalMembership.role: "admin" | "staff"` and the dynamic `AccessRole`/permission system are two separate, non-overlapping mechanisms: `role: "admin"` gates hospital-*management* actions (creating/listing AccessRoles, reviewing access requests); `AccessRole` permissions gate staff clinical/functional actions via `requirePermission`. Don't conflate them — an administrator doesn't need an `AccessRole` to manage the hospital.
- Never hardcode a clinical job title (Doctor/Nurse/Cardiologist/etc.) into authorization logic anywhere. Those are just example `AccessRole.name` values a hospital admin might choose — the app never branches on them.
- Never expose secrets to the frontend. `BREVO_API_KEY` and friends stay in `backend/.env` (gitignored) — never in `.env.example`, never in frontend code.
- **Hospital-scoped lookups: filter by hospital in the query, don't fetch-then-check.** When an admin acts on something by id (an access request, later a role edit, etc.), look it up as `findOne({ _id, hospitalId: req.hospitalId })`, not `findById(id)` followed by an `if (doc.hospitalId !== req.hospitalId)` check. The query-level filter means a cross-hospital id simply isn't found (`404`) rather than being found-then-rejected — smaller surface for a forgotten check to leak existence/data across hospitals.
- **State machines are one-way unless a transition is explicitly designed.** `HospitalMembership.status` (`pending → active | rejected`) only ever moves forward from `pending`; both `active` and `rejected` are terminal until a real "re-request" or "change role" feature is deliberately built (see PHASES.md) — don't let an approve/reject handler silently re-fire on an already-decided record.
- A defensive check can be provably unreachable given other constraints already in place (e.g. the self-approval check in `accessRequest.service.ts` — unreachable because the unique `(userId, hospitalId)` index already rules out someone being simultaneously an active admin and a separate pending requester in the same hospital). Keep such checks as defense-in-depth, but don't invent a test that has to violate a real constraint just to exercise it — say so plainly instead.

## Preserve working systems

Authentication, portal isolation, refresh-token rotation, hospital-switching, and now the RBAC permission-resolution foundation are built and tested (see `backend/tests/`). Don't rewrite them "while you're in there" — extend them. If a new feature seems to require changing this core, stop and confirm that's actually necessary first.

## Frontends

Three separate Next.js apps (`patient-frontend` 3001, `hospital-frontend` 3002, `owner-frontend` 3003) — do not merge them into one app. Share only genuinely common code via the root `shared/` folder (types + a thin API client), imported via the `@shared/*` alias. Each frontend's `next.config.ts` sets `turbopack.root` to the repo root so that alias resolves — don't remove it. Keep the access token in memory only (never localStorage); each app calls `restoreSession()` on load to trade the refresh cookie for a new access token.

- **`restoreSession()` (`shared/api.ts`) deduplicates concurrent calls** via a module-level in-flight promise. The refresh token rotates on every use, so two callers presenting the same cookie at once would otherwise race (first rotates it, second's rotation then 401s because that token is already gone) — this happened for real under React Strict Mode's double effect-invocation in dev. Because of this dedup, it's safe for more than one component (e.g. a portal layout *and* a page) to call `restoreSession()` on the same load — only one actual network request goes out. Don't remove this guard, and don't add a second, separate session-restore code path that bypasses it.
- **Styling: Tailwind CSS v4, in all three frontends.** Installed via `tailwindcss` + `@tailwindcss/postcss` (`postcss.config.mjs`), pulled in via `@import "tailwindcss";` in `app/globals.css`. No other styling system — no CSS Modules, no component library (MUI/Chakra/styled-components), no per-page CSS files. There's one small shared UI primitive set per app, `components/ui/` (`Button`, `Card`, `TextField`, `Alert`, `Badge`, etc. — see DESIGN.md for the full list and conventions), duplicated across the three apps like the layout components below, not pulled into `shared/`. Use the existing primitives before reaching for raw Tailwind classes on a new page; add a new primitive only once a second real page needs the same pattern.
- **Application shell (Header/Sidebar/`<Portal>Layout`) — Tailwind, not plain CSS.** Each portal's protected routes live under an `app/(portal)/` route group (a route group, not a URL segment — doesn't change any path) whose `layout.tsx` wraps them in that portal's `<Portal>Layout` (`PatientLayout`/`HospitalLayout`/`OwnerLayout`); `/login`, `/register`, `/forgot-password` stay outside the group and render bare, with no header/sidebar. Each `<Portal>Layout` does its own lightweight session check purely to decide whether to show navigation chrome — it never gates or replaces a page's own auth handling, so a logged-out page's existing "log in first" state renders exactly as it did before the shell existed. Nav items are config-driven (`components/layout/nav.ts` per app) and only list routes that actually exist — don't add nav links to unbuilt pages. Header/Sidebar are duplicated per app on purpose, not pulled into `shared/` — `shared/` stays scoped to types + the API client per the paragraph above, and the three portals are allowed to diverge (e.g. the Patient Portal shell has no sidebar yet, since it only has one protected route today). Global actions live in the shell, not the page — logout is only in the Header, "Access & Roles"/"Hospitals" nav only in the Sidebar; don't re-add a duplicate logout button or nav link to a page's own content. **Hospital Portal only:** the Header's account menu (`AccountMenu.tsx`) is a second, separate nav surface for personal/account actions (Profile, Request hospital access, Settings, Log out) — the Sidebar stays scoped to hospital-application navigation only; see the "Account navigation vs. hospital navigation" section in DESIGN.md before adding anything to either one.
- **Frontend nav filtering is presentation only, never authorization.** A `<Portal>Layout` may hide a nav item based on what it already knows about the session (e.g. hospital admin vs. staff), but that's cosmetic — the backend's `requirePermission`/`requirePortal` checks are the only real boundary. Never infer or store fine-grained permissions on the frontend to decide what to show; only use signals the session response already legitimately exposes.

## Testing & manual verification

- `cd backend && npm test` runs the vitest suite (hits the real MongoDB Atlas dev database and the real Brevo API — that's intentional, not mocked).
- When manually verifying a new flow, prefer exercising it through the real HTTP API end-to-end over writing throwaway seed scripts. If a temporary script is genuinely needed for testing, delete it afterward — don't leave it in the repo.
- Ports are fixed: backend `5001`, patient `3001`, hospital `3002`, owner `3003`. Don't change them without updating `ALLOWED_ORIGINS`/`.env` everywhere.
