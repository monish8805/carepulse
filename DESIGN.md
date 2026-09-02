# CarePulse — Design Direction

**Status: UI system live, visual palette adopted from a reference mockup.** The color palette, corner radius/shadow scale, and iconography below are the real adopted look (indigo accent, `lucide-react` icons, `Avatar`/`IconBadge` primitives) — not a placeholder. Dashboard/clinical content is still not designed (Phase 3+). What *is* decided and built is the full application UI: the shell (header/sidebar) and every existing page's actual content, using Tailwind CSS and a small shared primitive set. Treat everything below as real, not a skeleton — it was applied to every existing route in all three frontends and verified against a real build.

## Current actual state

Tailwind CSS v4 is installed in all three frontends (`tailwindcss`, `@tailwindcss/postcss`, wired via `postcss.config.mjs` and `@import "tailwindcss";` in `app/globals.css`). Every page — auth pages, the portal shell, and every protected page's content — is styled with Tailwind utility classes plus the shared primitives in `components/ui/`. There is no other styling system: no CSS Modules, no plain per-page CSS files, no component library. `components/layout/layout.css` (the pre-Tailwind shell CSS) has been deleted; the shell is Tailwind classes now too.

## UI primitives — `components/ui/` (Live, duplicated per app)

One small set of presentational components, written once and copied into all three frontends (not pulled into `shared/`, which stays scoped to types + the API client per CLAUDE.md). Import from the barrel: `import { Button, Card, ... } from "@/components/ui"`.

| Component | Purpose |
|---|---|
| `PageContainer` | The one page-width wrapper (`max-w-3xl`, responsive padding) — every page's top-level element. |
| `PageHeader` | `<h1>` + optional description, used once per page. |
| `SectionHeading` | Smaller `<h2>` + optional description, for grouping within a page (rarely needed once `Card` already has a `title`). |
| `Card` | Bordered, shadowed surface (`rounded-xl`, `shadow-sm`) with optional `title`/`description`/`icon`; the base container for every form and list. `icon` (a `lucide-react` `LucideIcon`) renders an `IconBadge` next to the title when both are present — omit it when a card has no title, or when nothing in the icon set actually matches the section. |
| `Avatar` | Circle with initials, background tint deterministically hashed from `name` (`size`: `sm`/`md`). Purely decorative — never conveys meaning the way `Badge`'s tone does. Used in the account menu trigger and next to every person-row (staff list, pending-request list). |
| `IconBadge` | Small colour-tinted rounded-square wrapping one `lucide-react` icon (`tone`: `indigo`/`blue`/`teal`/`amber`/`violet`, default `indigo`). Used before a `Card`/section title and for Sidebar nav items — decorative only, never the sole affordance for an action; the text label is always right next to it. |
| `Label` / `Input` / `Select` | Bare styled form primitives — used directly when a composed `TextField` doesn't fit (e.g. a search box). |
| `TextField` | Label + Input + error/hint, id/`htmlFor` wired automatically via `useId()`. The default way to build a form field. |
| `Stepper` | Numbered progress indicator for short, linear multi-step flows (`labels: string[]`, `currentIndex`) — completed steps show a ✓, connecting lines fill in indigo as you progress. Presentational only; the owning page decides what a "step" means. Used by Patient/Hospital `/register`. Owner has no multi-step flow, so it isn't copied there. |
| `Checkbox` | Styled checkbox + associated label (used for `AccessRole` permissions). |
| `Button` | One button for every case — `variant`: `primary` (default action) / `secondary` (neutral, e.g. "Switch hospital", "Log out") / `destructive` (e.g. "Reject") / `ghost` (low-emphasis, e.g. sidebar collapse). |
| `Badge` + `toneForStatus(status)` | Status pill with a leading colored dot (`pending`/`active`/`rejected`/`admin` → tone) — display only, mirrors backend strings verbatim, never used for an access decision. |
| `Alert` | Replaces the old `<p style={{color:"red"}}>`/green pattern — `variant`: `error` (`role="alert"`) / `success` / `info`. |
| `EmptyState` | Centered message (+ optional action) for an empty list — replaces bare "No X yet." text. |
| `LoadingState` | Centered spinner + label — the one loading indicator, used both for full-page and section-level loading. |
| `Divider` | Plain styled `<hr>`. |
| `Modal` | Overlay dialog (`role="dialog"`, closes on Escape/overlay click/✕). Hospital Portal only so far (`AddStaffModal`, the remove-staff confirmation) — not yet copied to patient/owner since nothing there needs it; copy it over the first time one of those apps does. Role management (`ManageRolesPanel`) deliberately does **not** use `Modal` — see the Staff management section below. |

**Keep this list minimal.** Add a new primitive only once a second real page needs the same pattern — don't build ahead of actual usage.

## Color & typography conventions

Adopted from a user-provided reference mockup of `/access` (still branded "CarePulse"), applied identically across all three portals. Not necessarily final forever, but this is the real palette now, not a stand-in:

- **Neutrals:** Tailwind's `slate` scale for text/borders/surfaces (`slate-900`/`slate-100` text, `slate-200`/`slate-800` borders, `slate-50`/`slate-950` page background so cards visually lift off the ground, `white`/`slate-900` for `Card`/`Header`/`Sidebar`/`Modal` surfaces themselves).
- **Accent (primary actions, links, active nav, focus rings):** `indigo-600` (light) / `indigo-400` (dark, used only for text — buttons keep `indigo-600` fill in both modes).
- **Destructive:** `red-600`. **Success:** `green-600`/`green-700`. **Pending/warning:** `amber-600`/`amber-700`.
- **Corner radius:** cards/modals `rounded-xl`; buttons/inputs/selects/icon badges/sidebar links `rounded-lg`; pills (`Badge`), `Avatar`, and the `Stepper`'s step circles stay `rounded-full`.
- **Shadows:** `Card` and the account-menu/`Modal` panels carry `shadow-sm` against the `slate-50`/`slate-950` page ground. `Header`/`Sidebar` stay border-only, no shadow — they're chrome, not floating content.
- **Iconography:** `lucide-react`, used as decorative accents only — before a `Card`/section title (via `IconBadge`) and next to each Sidebar nav item — never as the sole affordance for an action; every icon sits beside a real text label. Two things from the reference were deliberately not replicated: the floating rounded-card "device frame" around the whole screenshot (presentation chrome for the mockup image, not a real UI element) and fabricated staff fields the reference showed (a `Joined on` column, `ID: ST-2024-0012` staff codes) — `StaffMember` doesn't track either, and this was a visual pass, not a data-model change.
- **Dark mode:** Tailwind's default `dark:` variant (`prefers-color-scheme`, no in-app toggle) — every component pairs a light class with a `dark:` class; there is no separate dark stylesheet.
- **Typography:** Tailwind's default `font-sans` stack (no custom webfont actively wired — the Geist font loader in each `app/layout.tsx` sets CSS variables but nothing currently references them). `text-2xl font-semibold` for page `<h1>` (via `PageHeader`), `text-lg font-semibold` for `<h2>` (via `SectionHeading`/`Card` title), `text-sm` for body/labels, `text-xs` for meta text (badges, hints, ids).
- **Spacing:** Tailwind's default scale — `space-y-6` between major page sections, `space-y-4` inside a form, `p-5` card padding, `px-4 py-2` button padding.

## Layout conventions — Live

- **Shell structure:** sticky `Header` (`h-14` = 56px) above a content row; on Hospital/Owner that row is `Sidebar` + scrollable content, on Patient it's just the scrollable content (no sidebar — only one protected route exists today, see ARCHITECTURE.md).
- **Sidebar:** `w-56` expanded, `w-14` collapsed (desktop only, persisted per-portal to `localStorage`, read post-mount to avoid a hydration mismatch). Config-driven nav (`components/layout/nav.ts` per app) — add a nav item there, not by hand-editing `Sidebar.tsx` JSX, and only for routes that actually exist.
- **Active nav state** is derived from `usePathname()`, never click state, so a deep link highlights the right item immediately.
- **Responsive breakpoint:** `md` (768px). Below it, the sidebar becomes an off-canvas drawer (slides in from the left under the header, with a dimmed overlay) instead of a persistent column; the hamburger menu button in the Header only renders on portals that have a sidebar at all.
- **Auth pages** (`/login`, `/register`, `/forgot-password`) are deliberately outside the shell — centered card on a neutral background (`bg-slate-50 dark:bg-slate-950`), no header/sidebar.
- **Page content:** every protected page's top-level element is `PageContainer` → `PageHeader` → a `space-y-6` stack of `Card`s. List rows inside a `Card` use `divide-y divide-slate-200 dark:divide-slate-800`.
- **Global actions live in the shell, not the page.** Nav to an existing page is only in the Sidebar (or the account menu — see below) — pages don't render their own duplicate link/button now that the shell always surrounds them.
- **Dashboards** — per-portal dashboard *content* (patient/hospital/owner) still not built (Phase 2+). Every existing page (status pages, hospital creation, AccessRole/access-request management) is now fully styled; what's still a placeholder is *new* clinical/monitoring content, not the pages that already exist.

## Account navigation vs. hospital navigation — Live (all three portals)

Two distinct, deliberately separate navigation surfaces in the Header, so the Sidebar stays scoped to one thing. `AccountMenu.tsx` is now wired into all three frontends' Headers (copied per app, like every other layout component — not pulled into `shared/`); each `<Portal>Layout` builds its own `items` list.

- **Sidebar — hospital/owner-application navigation only.** Routes for *doing the portal's actual work*: Hospital has Home and Access & Roles; Owner has Home and Hospitals; Patient has no sidebar yet (only one protected route today). Config-driven via `components/layout/nav.ts` per app. Never put a personal/account action here.
- **Account menu (top-right of the Header, `AccountMenu.tsx`) — personal/account actions**, not application pages. Hospital Portal: `Profile`, `Request hospital access`, `Settings`, divider, `Log out`. Owner/Patient Portals: `Profile`, `Settings`, divider, `Log out` (no request-access item — not applicable to those portals). `Profile`/`Settings` render disabled everywhere with a "Coming soon" hint — no page exists yet for either, on any portal; don't wire them up until those pages are actually built. On Hospital, `Request hospital access` **navigates to `/access-request`** (`router.push`, not a modal) — a dedicated page rather than a header dropdown, since it has real content of its own (search, a hospital list, every past request with its status).
- **`AccountMenu` itself is fully generic** (props: `userName`, `userEmail`, `items: AccountMenuItem[]`, `onLogout`) — keyboard accessible (arrow keys move focus between enabled items, Escape closes and returns focus to the trigger, Tab closes), closes on outside click and on route change, responsive (name label hidden below `sm`). Each portal's `<Portal>Layout` decides its own `items` array; the component never hardcodes what belongs in it.
- **Why this split:** "which hospital am I acting within, and what can I do there" (Sidebar) is a different question from "what does this account itself want to do, regardless of hospital" (account menu). Requesting access to a *new* hospital is the second kind of action — it's about the account, not about the hospital currently selected — which is why it isn't on `/access` or in the Sidebar at all.
- **Popover panel styling:** `w-60`, right-aligned (`right-0 top-full`), `shadow-sm` — same border/surface tokens as `Card`.

## `/access-request` (Hospital Portal only) — Live

The dedicated home for requesting hospital access, reachable only from the account menu (not the Sidebar — see the split above). Two cards, same shell/primitives as every other page:

- **Find hospitals:** a search `Input` above a plain list of bordered rows (name + id, no card-grid/icon treatment — matches the rest of the app's list convention rather than the icon-heavy reference this was built from). A hospital already blocked by a `pending`/`active`/`rejected` request doesn't appear; one that's `removed` or `cancelled` does, since re-requesting is allowed for those.
- **My requests:** every request, any status, with a `Badge` (`toneForStatus`) and a "Requested on" date (`MyAccessRequest.createdAt`, added specifically for this). A **Cancel** button appears only on `pending` rows (`POST .../cancel`) — the only mutating action available here besides requesting itself; every other status is read-only history.
- Loading/empty/error/already-requested/success states follow the same pattern as every other page (`LoadingState`/`EmptyState`/`Alert`, per-row `disabled` + label swap while a request/cancel is in flight).

## Staff management — Live (Hospital Portal)

`/access` is staff-first: **Staff** is the only permanently-visible card. Adding/reviewing staff lives behind a `Modal`; role management is an inline expand/collapse panel in its own card, not a modal:

- **Staff card** (`canManageStaff`-gated: admin, or a staff member whose current AccessRole includes `staff.manage`): a search `Input` (client-side, filters the already-fetched list — no new query param) above the staff list. `isAdmin` only, a prominent **Add staff** button sits in the card header, its label showing a pending-request count when there's a backlog (`Add staff (3)`).
- **Each staff row** shows a `disabled` `Badge` when suspended, and up to three actions depending on state and who's viewing:
  - **Edit** (`isAdmin` only — a `staff.manage` holder can't even list AccessRoles, so this is never shown to them): swaps the row's action area for an inline `Select` of active roles + Save/Cancel — no modal, no navigation. `PATCH /api/hospital/staff/:id/role`.
  - **Disable** / **Enable** (`canManageStaff`-gated, single toggle button whose label follows the row's current status): a reversible suspension, distinct from Remove — `POST /api/hospital/staff/:id/disable` or `.../enable`. Disable is peer-protection-aware exactly like Remove (`StaffMember.canManageStaff`, disabled + tooltip when blocked); Enable has no such restriction.
  - **Remove** (`canManageStaff`-gated, only shown while `active` — a disabled member has nothing to remove from *right now*, re-enable first): unchanged — confirmation `Modal`, `DELETE /api/hospital/staff/:id`, peer-protection-aware disabling.
- **`AddStaffModal`** (`components/access/AddStaffModal.tsx`, `isAdmin`-gated): two stacked sections in one modal, not two entry points, since both end at "one more active staff member." **Add directly** — name/email/role form, `POST /api/hospital/staff`, success copy differs on whether a new account was created (temp password emailed) vs. an existing one was granted access. **Pending requests** — the same approve (role `Select` + Approve/Reject) review that used to be its own always-visible card, moved in as-is. Rendered by the page only while open (`{open && <Modal.../>}`), not passed an `open` prop — mount/unmount is what resets its internal state on every open.
- **`ManageRolesPanel`** (`components/access/ManageRolesPanel.tsx`, `isAdmin`-gated) is rendered **inline inside the Roles & Permissions Card**, toggled by a "Manage roles" button with a rotating `ChevronDown` — not a `Modal`. Same content as before (create-role form + role list + edit + delete, via internal view-switching `"list" | "edit" | "delete"`) but as plain content instead of a dialog overlay, so expanding it pushes the rest of the page down rather than opening a popup on top of it. Conditionally mounted only while expanded (`{rolesExpanded && <ManageRolesPanel .../>}`), same mount/unmount-resets-state pattern as `AddStaffModal`. Edit/Delete behave exactly as before (`PATCH`/`DELETE /api/hospital/access-roles/:id`, delete blocked with a 409 — shown via `Alert` inline — while any *active* staff member still holds that role).

## Forms — Live

Every form field is a `TextField` (or bare `Label`+`Input`/`Select` where a composed field doesn't fit, e.g. the hospital search box's custom dropdown). This gives every field, for free: a visible associated `<label>` (via `useId()`), consistent height/border/focus ring, a disabled state, and an `aria-invalid`/red-border/error-text state when an `error` prop is passed. Submit buttons show a loading label (`"Logging in..."`) and `disabled` while a request is in flight — unchanged from before, just via `Button` now. Success/failure feedback goes through `Alert`, never inline unstyled text.

- **`/register` (Patient, Hospital) is a 3-step flow**, using `Stepper` above the `Card`: **Details** (name, email, phone — client-side only, no request; "Continue" just advances) → **Password** (the actual `register()` API call fires here, on success advancing to Verify; has a "← Back" link to Details) → **Verify** (the existing OTP step, unchanged). The step-1→2 split is presentational only — the backend still receives one `register({name, email, phone, password})` call, same as before, just gathered across two screens instead of one.

## Sections still to fill in

- **Dashboard/clinical page layouts** — tables, charts, vitals displays, alerts UI: not designed, not built (Phase 3+).
- **Motion beyond the shell's own transitions** (sidebar slide/collapse, drawer overlay) — nothing further planned.

## How to use this file if the palette changes again

Replace the color/typography section above with the new palette and note any component whose Tailwind classes need to change. The structural conventions (shell dimensions, breakpoint, `PageContainer`/`Card`/form patterns) can stay as-is unless the new direction specifically calls for a different structure — this is implementation guidance, not a brand book.
