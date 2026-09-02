# CarePulse — Development Phases

Order matters: the authorization foundation comes before any hospital-operations feature, which comes before any patient-data feature, which comes before anything AI/ML, streaming, or visualization related. Don't jump ahead — each phase depends on the one before it actually being solid.

## Phase 1 — Foundation & Authorization ✅ Done

- Backend scaffold, layer-based structure, three separate frontends, shared code via `shared/`.
- One `User` identity; additive roles (patient/hospital/owner), not mutually exclusive.
- Registration + OTP verification, login/logout, forgot/reset password.
- Dual-token auth (short-lived access JWT + rotating opaque refresh token).
- Portal isolation, enforced server-side.
- Hospitals as organizations: `Hospital` + `HospitalMembership` models.
- Hospital switching, server-validated.
- Owner → Hospital → Hospital Administrator provisioning.
- **Dynamic RBAC foundation:** hospital-scoped `AccessRole` model, a validated permission catalogue, fail-closed permission resolution (`resolvePermissions`), a generic `requirePermission` middleware, and admin-gated `AccessRole` create/list endpoints. No clinical job titles hardcoded anywhere.
- **Hospital staff access-request workflow:** staff request access to a hospital (`pending`), a hospital admin reviews and approves (assigning an existing active same-hospital `AccessRole`) or rejects, all hospital-scoped to the admin's own context. One-way state transitions, fails closed on every invalid case (nonexistent hospital, duplicate request, wrong-hospital or inactive role, cross-hospital admin access, re-deciding an already-decided request).
- Test suite (vitest + supertest) covering provisioning, portal isolation, hospital switching, RBAC, and the staff access-request workflow (27 tests, all passing).

## Phase 2 — Hospital Operations Core (next)

- **Shared portal shell/navigation foundation ✅ Done.** Each frontend now has a portal-specific `<Portal>Layout` (Header, and a Sidebar for Hospital/Owner) wrapping every protected route via an `app/(portal)/` route group. See ARCHITECTURE.md and DESIGN.md.
- **UI/UX polish pass on all existing pages ✅ Done.** Tailwind CSS v4 installed in all three frontends; the shell and every existing page (auth pages, hospital creation, AccessRole management, staff access-request review, hospital switching) rewritten onto a small shared `components/ui/` primitive set — no more raw/unstyled HTML anywhere. Existing functionality (auth, logout, hospital switching, hospital creation, AccessRole creation, access requests, approval/rejection, RBAC, portal isolation) unchanged — this was a presentation-only pass. See DESIGN.md for the full system. Page *content* is still placeholder in the sense that no new dashboard/clinical data exists yet — what changed is that the pages that *do* exist now look like a real product instead of a functional prototype.
- Round out `AccessRole` management: edit a role's permissions, activate/deactivate a role. (Create + list, and assigning a role during approval, already exist.)
- Let a rejected staff member re-request access, and let an admin change an already-active staff member's `AccessRole`.
- Basic per-portal dashboards (currently all three portals are bare status pages, now properly styled inside the shell; the Hospital Portal now also needs a minimal way to submit/view a request and for an admin to review one — the Access & Roles page already covers this at a basic level).

## Phase 3 — Patient Data & Consent

- Patient record data model.
- Patient consent: granting/viewing/revoking which hospitals/staff can access their data.
- Vitals data model and capture.

## Phase 4 — Monitoring & Visualization

- Dashboards for vitals and patient status.
- Alerts/notifications.
- First real visualization work, scoped to what Phase 3's data model actually supports.

## Phase 5 — Advanced / AI Vision (later, exploratory)

Not scheduled in detail — sequenced last on purpose, since it depends on a working core platform and real data flowing through it:

- Digital Twin concept.
- 3D heart / advanced visualization.
- Real-time streaming.
- AI/ML-driven insights and alerting.
- RAG-based features.

## Working rule

Before starting any Phase N feature, Phase N-1 should already be working and tested — not just "mostly there." If a Phase 5 idea seems to require touching Phase 1 auth/authorization code, that's a signal to stop and reconsider, not a reason to bend the foundation.
