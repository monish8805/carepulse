# CarePulse — Architecture

Status tags used below: **Live** (built and tested), **Partial** (data model exists, flow doesn't yet), **Planned** (not built — see PHASES.md).

## System overview

```
patient-frontend (3001)  ─┐
hospital-frontend (3002) ─┼─► backend (5001, Express + TypeScript) ──► MongoDB (Atlas)
owner-frontend (3003)    ─┘                    │
                                                └──► Brevo (transactional email: OTP, welcome emails)
```

Three separate Next.js apps — not a single app with role-based views. They share only a thin root `shared/` folder (types + an API client), imported via a `@shared/*` path alias; each frontend's `next.config.ts` sets `turbopack.root` to the repo root to make that resolve.

## Backend structure — **Live**

Layer-based, flat (no `src/`, no feature-nested `modules/`):

```
app.ts          Express app: cors, json, cookies, routes, central error handler
server.ts       dotenv.config() → connectToDatabase() → app.listen()
config/         env.ts, db.ts, cors.ts
models/         User (embeds refreshTokens[]/registerOtp/resetOtp), Hospital, HospitalMembership, AccessRole
controllers/    auth, health, hospital, owner, accessRole, accessRequest — thin HTTP layer
domain/         auth.service.ts, hospital.service.ts, accessRole.service.ts, permission.service.ts, accessRequest.service.ts
routes/         auth, health, hospital (also mounts access-role and access-request routes), owner
middleware/     requireAuth, requirePortal, requirePermission
validators/     per-route request-shape checks
utils/          hash, jwt, otp, email, refreshToken, password, httpError
scripts/        seedOwner.ts (creates the one Platform Owner account)
tests/          vitest + supertest, run against the real dev database
```

## Authentication — **Live**: dual-token model

- **Access token:** JWT, 15 min expiry, payload `{ id, portal, hospitalId? }` only — no roles, no permissions. Returned in the response body; kept in memory on the frontend (never localStorage, never a readable cookie). Sent as `Authorization: Bearer <token>`.
- **Refresh token:** opaque random string, 30 day expiry, stored HttpOnly, `path=/api`, cookie **named per portal** (`patient_refresh_token` / `hospital_refresh_token` / `owner_refresh_token`) so three portal sessions can coexist in one browser without colliding. Only its SHA-256 hash is stored, embedded on the owning `User.refreshTokens[]` (not a separate collection) — each entry is `{ tokenHash, portal, hospitalId?, expiresAt, createdAt }`, capped at 3 concurrent entries per `(user, portal)` with FIFO eviction on login past the cap (rotation alone never grows the count). Issuance/rotation/removal use atomic MongoDB update operators, not a read-modify-save cycle — see the concurrency note under "Security boundaries" in CLAUDE.md for why.
- **Rotation:** every `POST /api/auth/refresh` removes the presented entry and pushes a new one. The entry's `portal` must match the request's — a refresh cookie from one portal can never mint an access token for another.
- **Session restore:** frontends call `restoreSession()` once on load, trading the refresh cookie for a fresh access token (the in-memory token doesn't survive a page reload by design).

## Portal isolation — **Live**

- `requirePortal(portal)` middleware rejects any request whose access token's `portal` claim doesn't match — enforced server-side, not just by frontend routing.
- `GET /api/auth/me` returns a response scoped to the authenticated portal only. It never includes the account's full `roles` list — a patient-portal session reveals nothing about that same user's hospital access, and vice versa.

## Hospitals & membership — **Live**

- `Hospital` — minimal: `{ name }`.
- `HospitalMembership` — `{ userId, hospitalId, role: "admin" | "staff", status: "pending" | "active" | "rejected", accessRoleId? }`, unique on `(userId, hospitalId)`.
  - `role` is a **coarse marker** that gates hospital-*management* authority only (e.g. who may create/list this hospital's `AccessRole`s) — it is not the permission system.
  - `accessRoleId` (added by the RBAC foundation) optionally points at an `AccessRole` in the **same** hospital — this is what drives a staff member's actual permissions (see below). Admin memberships typically leave it unset; their authority comes from `role: "admin"`, not from a permission.
  - `status`: `pending` (a submitted, unreviewed access request — grants nothing), `active` (grants access, per `role`/`accessRoleId`), `rejected` (terminal in this phase — see below). Owner-provisioned admins are created `active` directly; staff always start `pending` via a self-submitted request.
- **Switching (Live):** `GET /api/hospital/memberships` lists a user's active memberships; `POST /api/hospital/select { hospitalId }` re-verifies membership server-side (`verifyActiveMembership`) before minting a new access token carrying that `hospitalId`. The selection is also persisted on the matching `User.refreshTokens[]` entry so it survives a silent refresh — a client-supplied `hospitalId` is never trusted on its own.

## Owner → Hospital → Administrator provisioning — **Live**

- `POST /api/owner/hospitals` (portal `owner` only) creates a `Hospital` and its first administrator (`User` + `HospitalMembership{role:"admin", status:"active"}`) in one step.
- The administrator's temporary password is generated server-side, hashed, emailed once (never returned over HTTP), and they're expected to change it via the existing forgot-password flow.
- Creating a hospital does **not** create any `HospitalMembership` for the Owner — the Owner has no hospital-scoped access.

## Dynamic RBAC (permission) foundation — **Live**

- **Permission catalogue** (`config/permissions.ts`): a fixed, typed list of valid permission strings (namespaced `area.action` — `patient.view`, `vitals.view`, `alerts.view`, `alerts.acknowledge`, `staff.view`, `staff.manage`). `AccessRole.permissions` can only ever contain values from this list — validated on creation (`domain/accessRole.service.ts`), never arbitrary strings.
- **`AccessRole`** (`models/accessRole.model.ts`): `{ hospital, name, permissions[], isActive, createdBy, timestamps }`, unique on `(hospital, name)`. Hospital-scoped and hospital-defined — role *names* like "Cardiologist" or "Nurse" are just data an administrator enters, never hardcoded into authorization logic anywhere in the app.
- **Resolution** (`domain/permission.service.ts::resolvePermissions(userId, hospitalId)`): the single place that turns `(user, hospital)` into an actual permission list — `active HospitalMembership → accessRoleId → active AccessRole (re-checked to belong to the same hospital) → permissions`. Queried fresh from the database on **every** call; nothing is cached and nothing is read from the JWT. **Fails closed** at every step — a missing/inactive membership, a missing/inactive `AccessRole`, an `AccessRole` belonging to a different hospital, or invalid permission data all resolve to an empty set, never to unrestricted access. This is also why a permission change in MongoDB takes effect on the very next request, with no logout/login/refresh required.
- **Middleware** (`middleware/permission.middleware.ts::requirePermission(permission)`): generic and reusable, designed to sit after `requireAuth`/`requirePortal("hospital")` in a route chain, calling `resolvePermissions` on every request and returning `403` if the permission isn't present. Not yet wired to any real staff-facing feature route (none exist yet — see `staff.view`/`vitals.view` etc. as forward-looking catalogue entries); proven correct in `tests/rbac.test.ts` via a minimal Express router composed from the real middleware.
- **Management endpoints (admin-gated, not permission-gated):** `POST /api/hospital/access-roles` and `GET /api/hospital/access-roles` let a hospital's `role: "admin"` member create/list that hospital's `AccessRole`s. Editing and activating/deactivating a role are **Planned** — not built yet (tests exercise both by writing `isActive`/`permissions` directly via Mongoose).
- The access-token design (`{ id, portal, hospitalId? }`, no roles) was chosen specifically so this could be added without any token-format migration.

## Staff access-request workflow — **Live**

The lifecycle: `staff requests access (pending) → admin reviews → approve (active, AccessRole assigned) | reject (rejected, terminal)`.

- **Request** (`POST /api/hospital/access-requests`, body `{ hospitalId }`): any authenticated Hospital Portal session (`requireAuth` + `requirePortal("hospital")`, deliberately **no** current-hospital-context requirement, since a first-time requester has none) can request a specific hospital by id. Creates one `HospitalMembership{ role: "staff", status: "pending" }`. Fails with `404` if the hospital doesn't exist, `409` if a membership (of any status) already exists for that `(user, hospital)` pair — the model's unique index enforces this at the database level regardless. **Grants nothing**: `verifyActiveMembership` and `resolvePermissions` both require `status: "active"`, so a pending (or rejected) member cannot select that hospital or resolve any permission in it.
- **Self-check** (`GET /api/hospital/access-requests/mine`): the requester's own memberships, any status, across any hospital — how they see a pending/rejected state without a selectable hospital context.
- **Review, hospital-scoped to the admin's current context** (same pattern as `access-roles`): `GET /api/hospital/access-requests` lists `status: "pending"` requests for the admin's `req.hospitalId`. `POST /api/hospital/access-requests/:id/approve` (body `{ accessRoleId }`) and `.../reject` both look the request up as `{ _id, hospitalId: req.hospitalId }` — an id belonging to another hospital simply isn't found (`404`), never leaked or actionable.
- **Approval requires an existing, active, same-hospital `AccessRole`** — re-verified with the same `{ _id, hospital, isActive: true }` query `resolvePermissions` uses; a wrong-hospital, inactive, or missing role is always rejected (`400`). Approval never creates a role.
- **State transitions are one-way**: both approve and reject require `status === "pending"` first, else `409` — an already-active or already-rejected request cannot be re-approved/re-rejected, and rejection is terminal (no auto-reactivation).
- **Self-approval** is defended against in code (`membership.userId !== adminUserId`), though the unique `(userId, hospitalId)` index already makes it structurally unreachable — an active admin can never simultaneously hold a separate pending request in the same hospital.
- The Owner-provisioned Administrator flow is untouched: an admin's membership is still created directly as `active`, never as a `pending` request.

Still **Planned**: an admin endpoint to re-assign or change an already-active staff member's `AccessRole` outside of the initial approval, and re-requesting after a rejection (currently terminal — see PRD.md).

## Frontend UI system — **Live** (existing pages fully styled — no new dashboards/clinical content yet)

Each of the three frontends has Tailwind CSS v4 installed (`tailwindcss` + `@tailwindcss/postcss`, imported via `@import "tailwindcss";` in `app/globals.css` — no other styling system) plus a small shared UI primitive set at `components/ui/` (`Button`, `Card`, `TextField`, `Alert`, `Badge`, `EmptyState`, `LoadingState`, etc.), duplicated per app like the layout components below. See DESIGN.md for the full component list and the color/typography/spacing conventions built on top of it. Every existing page — auth pages and every protected page's actual content — uses these; there is no remaining inline-`style={{...}}` or unstyled native form control anywhere in the three frontends.

Each frontend also has its own `components/layout/` with a portal-specific `<Portal>Layout` (`PatientLayout`/`HospitalLayout`/`OwnerLayout`), plus generic `Header` and `Sidebar` components duplicated per app (not pulled into `shared/` — see CLAUDE.md for why). The shell is Tailwind utility classes, like everything else — there is no separate CSS file for it.

- **Routing integration:** each app has an `app/(portal)/` route group whose `layout.tsx` renders `<Portal>Layout>{children}</Portal>`. A route group changes nothing about the URL — `/`, `/access`, `/hospitals` are exactly what they were before. `/login`, `/register`, `/forgot-password` live outside the group and are never wrapped in shell chrome.
- **Session ownership:** `<Portal>Layout` does its own `restoreSession()`/`getMe()` call solely to decide whether to render Header/Sidebar at all and what to put in them (user name/email, current hospital, admin-gated nav). It does not gate page content — while no session is confirmed (or there isn't one), it renders `children` bare, so each page's own existing auth/loading state (already built before the shell existed) is unchanged and still the thing that actually decides what a logged-out visitor sees. Real access control remains entirely server-side.
- **Header:** presentational only (`title`, `subtitle`, `userName`/`userEmail`, `onLogout`, mobile-menu props) — never resolves permissions or session state itself; the owning Layout passes in whatever it has already decided.
- **Sidebar:** renders `NavSection[]` config (`components/layout/nav.ts` per app — only lists routes that actually exist), derives the active item from `usePathname()` (not click state, so deep links highlight correctly), and owns its own desktop collapse/expand state (persisted to `localStorage`, read after mount to avoid a hydration mismatch). Mobile open/close state is owned by `<Portal>Layout` and passed down to both Header (hamburger button) and Sidebar (off-canvas drawer + overlay), since both need to agree on it.
- **Account menu (Hospital Portal only, `components/layout/AccountMenu.tsx`):** a second nav surface in the Header, separate from the Sidebar on purpose — personal/account actions (Profile, Request hospital access, Settings, Log out) rather than hospital-application pages. `HospitalLayout` builds the item list (Profile/Settings disabled with a "Coming soon" hint — no page exists yet) and owns the state for `RequestAccessModal`, a self-contained dialog with its own data-fetching/form state that the "Request hospital access" item opens. See the account-nav vs. hospital-nav split in DESIGN.md.
- **Per-portal shape:** Hospital and Owner portals get a real sidebar (2 nav items each today). The Patient Portal currently has only one protected route, so `PatientLayout` renders a header-only shell — no forced sidebar just for consistency's sake.
- **Nav filtering is presentation only.** Any hide/show decision a Layout makes based on session data (e.g. hospital admin vs. staff) is cosmetic — it changes nothing about what the backend will actually allow; `requirePermission`/`requirePortal` are still the only real boundary.

## Server-side authorization & data isolation — **Live** (principle, enforced today for what exists)

- Nothing permission-sensitive is decided from JWT claims alone; every hospital-context decision re-queries the database, including permission resolution (`resolvePermissions`).
- `hospitalId` from a client is always re-verified against `HospitalMembership` before being trusted.
- An `AccessRole` is only ever honored for the hospital it actually belongs to — resolution re-checks `AccessRole.hospital` against the current hospital context, so a membership record pointing at another hospital's role (however that happened) still resolves to no permissions.
- CORS is locked to the three known frontend origins (`ALLOWED_ORIGINS`), with credentials enabled for the cookie flow.
