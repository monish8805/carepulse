# CarePulse — Design Direction (placeholder)

**Status: pending.** No design reference has been provided yet — this file is a skeleton to fill in once it is. Nothing below should be treated as decided. Branding and colors are explicitly *not* locked yet.

## Current actual state (as of Phase 1)

Every page across all three frontends today is intentionally bare: plain React/Next.js with inline `style={{...}}`, no Tailwind, no component library, no design tokens. `components/ui/` exists as an empty placeholder folder in each frontend. This was a deliberate choice to keep Phase 1 focused on the auth/authorization foundation, not UI polish.

## Sections to fill in once a reference is provided

- **Layout conventions** — page structure, header/nav per portal, container widths.
- **Auth pages** — register/login/forgot-password/reset-password layout and states (loading, error, success) — currently minimal forms, no styling system.
- **Dashboards** — per-portal dashboard layout (patient/hospital/owner) — not built yet (Phase 2+).
- **Cards** — component pattern once one exists.
- **Forms** — input/button/label conventions, validation display.
- **Tables** — list/table conventions (e.g. hospitals list, memberships list).
- **Spacing scale** — TBD.
- **Responsive behavior** — TBD (nothing has been tested below desktop width yet).
- **Animations/transitions** — TBD.
- **Tailwind conventions** — TBD; Tailwind is not yet installed in any frontend.
- **Color palette & branding** — deliberately deferred. Do not lock this in before the reference is provided.

## How to use this file once the reference arrives

Replace each "TBD" section above with concrete conventions extracted from the reference, and note which frontend(s) each applies to. Keep it practical — this is implementation guidance, not a brand book.
