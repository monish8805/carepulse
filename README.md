# CarePulse

A healthcare app built as a modular monolith, with a separate frontend and backend.

## Structure

- `frontend/` — Next.js + TypeScript app
- `backend/` — Express + TypeScript API, using MongoDB with Mongoose

## Running locally

### Backend

```
cd backend
npm install
cp .env.example .env
npm run dev
```

The API starts on `http://localhost:5001`. Check `http://localhost:5001/api/health`.

### Frontend

```
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

The app starts on `http://localhost:3001`.
