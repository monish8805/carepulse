# CarePulse — Product Requirements

## What it is

CarePulse is a healthcare platform connecting three kinds of users through three separate portals, backed by one shared identity system. A person's login is not tied to a single role — someone can be a patient *and* hospital staff on the same account.

## Portals

| Portal | Port | Who | Access model |
|---|---|---|---|
| Patient Portal | 3001 | Patients | Self-register (OTP-verified), log in, manage their own account |
| Hospital Portal | 3002 | Hospital staff & administrators | Provisioned by an Owner (initial admin) or, later, by an approving administrator (staff). Can belong to and switch between multiple hospitals |
| Owner Portal | 3003 | Platform Owner(s) | Login only — no public registration. Seeded manually. Creates hospitals and their initial administrators |

## Current scope (built)

- **One shared `User` identity.** `roles` (patient/hospital/owner) are additive, not mutually exclusive.
- **Registration & verification:** patient/hospital self-registration with email OTP verification (Brevo, with a console-log fallback for local dev). Owner accounts are never self-registered.
- **Auth:** login, logout, forgot/reset password. See ARCHITECTURE.md for the token model.
- **Portal isolation:** a session authenticated through one portal cannot see or act on data belonging to another portal, even for a multi-role user.
- **Hospitals as organizations:** an Owner creates a `Hospital` and provisions its first Hospital Administrator in one step. The administrator receives temporary credentials by email and is expected to change their password (existing forgot-password flow).
- **Hospital membership & switching:** a user can hold active memberships in multiple hospitals. The Hospital Portal lets them switch context between hospitals they actually belong to — server-verified on every switch, never trusted from the client.
- **Owner boundary:** creating a hospital does not grant the Owner any access to that hospital's data — the Owner has no hospital membership.
- **Dynamic RBAC foundation.** Each hospital defines its own `AccessRole`s (a name + a set of permissions from a fixed catalogue, e.g. `patient.view`, `vitals.view`, `alerts.view`, `alerts.acknowledge`, `staff.view`, `staff.manage`) — CarePulse never hardcodes clinical job titles like "Doctor" or "Nurse" into authorization logic; those are just example names an administrator might pick. A hospital administrator can create, list, edit (permissions), and delete their hospital's `AccessRole`s — deletion is blocked while any active staff member currently holds that role. A staff member's permissions in a hospital are resolved fresh from the database on every request — from their active `HospitalMembership` in that hospital, to the `AccessRole` it currently points to, to that role's permissions — never cached, never stored in a token. A missing or inactive membership/role always means *no* permissions, never full access.
- **Staff access-request lifecycle.** An eligible user (one who's registered and verified for the Hospital Portal — the existing registration flow) can request access to a specific hospital by id. The request starts `pending` and grants nothing. A hospital administrator lists pending requests for *their own* hospital only, and approves (assigning an existing active `AccessRole` that belongs to that same hospital) or rejects. Approval and rejection are one-way from `pending` — an already-decided request can't be re-decided, and rejection doesn't auto-reactivate. A user can hold at most one membership (of any status) per hospital — no duplicate requests, and **no re-requesting after a rejection in this phase** (a deliberate scope limit, not a permanent decision). The Owner-provisioned Administrator never goes through this flow — that account is created `active` directly.
- **Staff management.** A hospital administrator — or a staff member whose current `AccessRole` includes `staff.manage` — can view and remove a hospital's active staff. A `staff.manage` holder can remove other staff but not another `staff.manage` holder (peer protection) and never the administrator, who can never be removed through this feature. Removing someone doesn't delete their account or history — it sets their membership to a `removed` state, and unlike a rejection, they're free to request access again later.

## Future scope (vision — not yet built, not yet detailed architecture)

These are documented so direction is clear, not because they're designed or scheduled. See PHASES.md for sequencing.

- **Re-requesting after rejection** (distinct from re-requesting after removal, which is already built), and an admin endpoint to change an already-active staff member's `AccessRole`. Both are reasonable near-term additions, just not built yet.
- **Patient consent management.** Patients will control which hospitals/staff can see their data — grant, view, and revoke access. Not designed yet.
- **Vitals capture.** Structured storage and capture of patient vitals data. Not designed yet.
- **Digital Twin / continuous monitoring vision.** A longer-horizon idea: a patient-specific model built from ongoing vitals/data, supporting monitoring and visualization (potentially including things like a 3D heart view). Directional only — no architecture committed.
- **AI/ML-driven features:** insights, alerting, and RAG-based tooling over patient/hospital data. Directional only.
- **Portal dashboards.** All three portals currently have bare-bones status pages (backend health, logged-in-as, and the Owner's Hospitals list), now rendered inside each portal's shared header/sidebar shell and fully styled with the Tailwind-based UI system (see ARCHITECTURE.md and DESIGN.md) — no raw/unstyled HTML remains anywhere. Real dashboard *content* (patient data, vitals, alerts) comes later, after the core data model exists — this pass was presentation only.

## Explicit non-goals (for now)

- No hardcoded clinical role taxonomy.
- No permission logic baked into the JWT — always resolved server-side.
- No feature in "future scope" should be started before the phase ordering in PHASES.md says so.
