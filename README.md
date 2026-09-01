# CarePulse

A healthcare app built as a modular monolith, with a shared backend and three separate frontends.

## Structure

- `backend/` — Express + TypeScript API, using MongoDB with Mongoose. One `User` collection and one auth system shared by every role (a person can hold more than one role, e.g. patient AND hospital staff). Layer-based structure: `controllers/`, `routes/`, `domain/` (business logic), `models/`, `middleware/`, `validators/`, `config/`, `utils/`, `scripts/`.
- `patient-frontend/` — Next.js app for patients (register, login, forgot password). Port `3001`.
- `hospital-frontend/` — Next.js app for hospital staff (register, login, forgot password). Port `3002`.
- `owner-frontend/` — Next.js app for the platform owner (login only — no public registration). Port `3003`.
- `shared/` — Types and a small API client shared by all three frontends.

## Running locally

### Backend

```
cd backend
npm install
cp .env.example .env   # then fill in MONGODB_URI, JWT_SECRET, BREVO_API_KEY, etc.
npm run dev
```

The API starts on `http://localhost:5001`. Check `http://localhost:5001/api/health`.

Registration and password-reset OTP codes are sent by email via Brevo, and are always
also printed to the backend console (`[OTP] ...`) so you can test locally without a
working Brevo sender.

### Seed the Platform Owner account (once)

Owner accounts can't be created through public registration. Run:

```
cd backend
npm run seed:owner
```

This creates one owner account (email/password are set in `backend/scripts/seedOwner.ts`).

### Authentication

- Short-lived access JWT (`{id, portal, hospitalId?}`, 15 min) returned in the login/refresh response body — the frontend keeps it in memory only, never in localStorage. `portal` and `hospitalId` are context, not permissions: they're never trusted for authorization, only for scoping which session this is.
- Long-lived opaque refresh token (30 days) in an `HttpOnly` cookie, scoped to `/api`. Only its SHA-256 hash is stored in the database. Each portal gets its own cookie name (`patient_refresh_token`, `hospital_refresh_token`, `owner_refresh_token`) so three portal sessions can coexist in the same browser without overwriting each other.
- Every refresh rotates the token and re-validates `portal`: the old one is deleted and a new one issued, so a reused/stolen token — or one from the wrong portal — stops working.
- `POST /api/auth/refresh` (body: `{ portal }`) is what restores a session after a page reload (the frontends call this once on load).

### Portal isolation & hospital switching

- `GET /api/auth/me` only ever returns data for the portal the session was authenticated through — a user who is also hospital staff sees no trace of that from a Patient Portal session.
- Hospital-only endpoints (`/api/hospital/*`) require a session whose access token has `portal: "hospital"`; a token from any other portal gets a 403.
- A user can belong to multiple hospitals (`HospitalMembership`, separate from the coarse patient/hospital/owner `roles` on `User`). `GET /api/hospital/memberships` lists active ones; `POST /api/hospital/select { hospitalId }` switches context — the backend re-verifies membership server-side before issuing a new access token, never trusting the hospitalId on its own. The selected hospital is remembered on the refresh token, so it survives a silent refresh.

### Frontends

Each frontend is a separate app with its own `.env.local`:

```
cd patient-frontend    # or hospital-frontend / owner-frontend
npm install
cp .env.local.example .env.local
npm run dev
```

- Patient app: `http://localhost:3001`
- Hospital app: `http://localhost:3002`
- Owner app: `http://localhost:3003`
