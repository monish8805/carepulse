# CarePulse — Design Direction

**Status: UI system live, branding still deferred.** No brand reference has been provided — color palette beyond the neutral/blue set below, typography beyond Tailwind's default sans stack, and all dashboard/clinical content are still placeholders. What *is* now decided and built is the full application UI: the shell (header/sidebar) and every existing page's actual content, using Tailwind CSS and a small shared primitive set. Treat everything below as real, not a skeleton — it was applied to every existing route and verified against a real build.

## Current actual state

Tailwind CSS v4 is installed in all three frontends (`tailwindcss`, `@tailwindcss/postcss`, wired via `postcss.config.mjs` and `@import "tailwindcss";` in `app/globals.css`). Every page — auth pages, the portal shell, and every protected page's content — is styled with Tailwind utility classes plus the shared primitives in `components/ui/`. There is no other styling system: no CSS Modules, no plain per-page CSS files, no component library. `components/layout/layout.css` (the pre-Tailwind shell CSS) has been deleted; the shell is Tailwind classes now too.

## UI primitives — `components/ui/` (Live, duplicated per app)

One small set of presentational components, written once and copied into all three frontends (not pulled into `shared/`, which stays scoped to types + the API client per CLAUDE.md). Import from the barrel: `import { Button, Card, ... } from "@/components/ui"`.

| Component | Purpose |
|---|---|
| `PageContainer` | The one page-width wrapper (`max-w-3xl`, responsive padding) — every page's top-level element. |
| `PageHeader` | `<h1>` + optional description, used once per page. |
| `SectionHeading` | Smaller `<h2>` + optional description, for grouping within a page (rarely needed once `Card` already has a `title`). |
| `Card` | Bordered surface with optional `title`/`description`; the base container for every form and list. |
| `Label` / `Input` / `Select` | Bare styled form primitives — used directly when a composed `TextField` doesn't fit (e.g. a search box). |
| `TextField` | Label + Input + error/hint, id/`htmlFor` wired automatically via `useId()`. The default way to build a form field. |
| `Stepper` | Numbered progress indicator for short, linear multi-step flows (`labels: string[]`, `currentIndex`) — completed steps show a ✓, connecting lines fill in blue as you progress. Presentational only; the owning page decides what a "step" means. Used by Patient/Hospital `/register`. Owner has no multi-step flow, so it isn't copied there. |
| `Checkbox` | Styled checkbox + associated label (used for `AccessRole` permissions). |
| `Button` | One button for every case — `variant`: `primary` (default action) / `secondary` (neutral, e.g. "Switch hospital", "Log out") / `destructive` (e.g. "Reject") / `ghost` (low-emphasis, e.g. sidebar collapse). |
| `Badge` + `toneForStatus(status)` | Status pill (`pending`/`active`/`rejected`/`admin` → tone) — display only, mirrors backend strings verbatim, never used for an access decision. |
| `Alert` | Replaces the old `<p style={{color:"red"}}>`/green pattern — `variant`: `error` (`role="alert"`) / `success` / `info`. |
| `EmptyState` | Centered message (+ optional action) for an empty list — replaces bare "No X yet." text. |
| `LoadingState` | Centered spinner + label — the one loading indicator, used both for full-page and section-level loading. |
| `Divider` | Plain styled `<hr>`. |
| `Modal` | Overlay dialog (`role="dialog"`, closes on Escape/overlay click/✕). Hospital Portal only so far (`RequestAccessModal`) — not yet copied to patient/owner since nothing there needs it; copy it over the first time one of those apps does. |

**Keep this list minimal.** Add a new primitive only once a second real page needs the same pattern — don't build ahead of actual usage.

## Color & typography conventions

Not a locked brand palette — chosen to be clean/neutral/healthcare-appropriate per the current direction, and easy to replace wholesale later:

- **Neutrals:** Tailwind's `slate` scale for text/borders/surfaces (`slate-900`/`slate-100` text, `slate-200`/`slate-800` borders, `white`/`slate-950` page background, `slate-50`/`slate-950` for the centered auth-page background).
- **Accent (primary actions, links, active nav, focus rings):** `blue-600` (light) / `blue-400` (dark, used only for text — buttons keep `blue-600` fill in both modes).
- **Destructive:** `red-600`. **Success:** `green-600`/`green-700`. **Pending/warning:** `amber-600`/`amber-700`.
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
- **Account menu (top-right of the Header, `AccountMenu.tsx`) — personal/account actions**, not application pages. Hospital Portal: `Profile`, `Request hospital access`, `Settings`, divider, `Log out`. Owner/Patient Portals: `Profile`, `Settings`, divider, `Log out` (no request-access item — not applicable to those portals). `Profile`/`Settings` render disabled everywhere with a "Coming soon" hint — no page exists yet for either, on any portal; don't wire them up until those pages are actually built. On Hospital, `Request hospital access` opens `RequestAccessModal` (a self-contained dialog with its own data-fetching and form state) rather than navigating anywhere, specifically so it stays reachable from every page via the Header instead of needing its own route.
- **`AccountMenu` itself is fully generic** (props: `userName`, `userEmail`, `items: AccountMenuItem[]`, `onLogout`) — keyboard accessible (arrow keys move focus between enabled items, Escape closes and returns focus to the trigger, Tab closes), closes on outside click and on route change, responsive (name label hidden below `sm`). Each portal's `<Portal>Layout` decides its own `items` array; the component never hardcodes what belongs in it.
- **`RequestAccessModal`'s hospital search is a proper ARIA combobox**, not just a styled `<input>` + `<ul>`: the input carries `role="combobox"`/`aria-autocomplete="list"`/`aria-expanded`/`aria-controls`, and the suggestion list carries `role="listbox"` with `role="option"`/`aria-selected` on each row (including the "No matching hospitals" placeholder, which needs `aria-selected` too even though it isn't a real choice — `jsx-a11y/role-has-required-aria-props` enforces this). There's no arrow-key navigation between suggestions (click/tap only) — don't add `aria-activedescendant` without also building that keyboard interaction, since claiming it without the behavior would mislead assistive tech.
- **Why this split:** "which hospital am I acting within, and what can I do there" (Sidebar) is a different question from "what does this account itself want to do, regardless of hospital" (account menu). Requesting access to a *new* hospital is the second kind of action — it's about the account, not about the hospital currently selected — which is why it moved out of the `/access` page's sidebar-reachable content into the account menu.
- **`AccessPage` (`/access`) itself is grouped to match:** "My requests" (tracking status of your own requests — what's left on this page from the access-request flow now that the request *action* lives in the account menu) sits above a "Hospital administration" section heading that groups three cards, each gated independently: `Roles & Permissions` and `Pending requests` (`user.hospital?.role === "admin"` only) and `Staff` (`user.hospital?.canManageStaff` — true for an admin, or a staff member whose current AccessRole includes `staff.manage`; see "Staff management" below).
- **Popover panel styling:** `w-60`, right-aligned (`right-0 top-full`), `shadow-sm` — same border/surface tokens as `Card`.

## Staff management — Live (Hospital Portal)

`Roles & Permissions` and `Staff` on `/access` now have real edit/delete actions, not just create/list:

- **Roles & Permissions:** each role row has `Edit` (opens `EditRoleModal` — the same permission-checkbox grid as creating a role, pre-filled, `PATCH /api/hospital/access-roles/:id`) and `Delete` (confirmation `Modal`, hard `DELETE` — blocked with a 409 server-side, shown via `Alert`, while any *active* staff member still holds that role). Both admin-only, matching create/list.
- **Staff:** a new card listing current active staff (name, email, their AccessRole's name), each with a `Remove` button (confirmation `Modal`, `DELETE /api/hospital/staff/:id` — sets their membership to a new `"removed"` status, not a hard delete, so there's a record and they can request to rejoin later). Visible to an admin, or to a staff member whose current AccessRole includes `staff.manage` — an admin can remove any staff member; a `staff.manage` holder can remove other staff but **not** another `staff.manage` holder (peer protection) and never an admin. The frontend disables `Remove` for a peer it already knows can't be removed (via `StaffMember.canManageStaff` in the list response) — the backend enforces the same rule independently regardless of what the UI shows.
- **`EditRoleModal`** (`components/access/EditRoleModal.tsx`) is keyed by `role.id` at its call site rather than watching the prop in an effect — remounting is what resets its internal permission-checkbox state when a different role is opened for editing.

## Forms — Live

Every form field is a `TextField` (or bare `Label`+`Input`/`Select` where a composed field doesn't fit, e.g. the hospital search box's custom dropdown). This gives every field, for free: a visible associated `<label>` (via `useId()`), consistent height/border/focus ring, a disabled state, and an `aria-invalid`/red-border/error-text state when an `error` prop is passed. Submit buttons show a loading label (`"Logging in..."`) and `disabled` while a request is in flight — unchanged from before, just via `Button` now. Success/failure feedback goes through `Alert`, never inline unstyled text.

- **`/register` (Patient, Hospital) is a 3-step flow**, using `Stepper` above the `Card`: **Details** (name, email, phone — client-side only, no request; "Continue" just advances) → **Password** (the actual `register()` API call fires here, on success advancing to Verify; has a "← Back" link to Details) → **Verify** (the existing OTP step, unchanged). The step-1→2 split is presentational only — the backend still receives one `register({name, email, phone, password})` call, same as before, just gathered across two screens instead of one.

## Sections still to fill in once a visual/brand reference is provided

- **Real color palette & branding** — the blue/slate set above is a placeholder, chosen for contrast and neutrality, not identity. Do not treat it as final.
- **Iconography** — none used anywhere yet (menu/collapse controls are plain characters/bars, not an icon set).
- **Dashboard/clinical page layouts** — tables, charts, vitals displays, alerts UI: not designed, not built (Phase 3+).
- **Motion beyond the shell's own transitions** (sidebar slide/collapse, drawer overlay) — nothing further planned.

## How to use this file once a brand reference arrives

Replace the color/typography section above with the real palette and note any component whose Tailwind classes need to change. The structural conventions (shell dimensions, breakpoint, `PageContainer`/`Card`/form patterns) can stay as-is unless the reference specifically calls for a different structure — this is implementation guidance, not a brand book.
