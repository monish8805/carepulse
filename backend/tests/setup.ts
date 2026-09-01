import dotenv from "dotenv";
dotenv.config();

// This file exists only so dotenv.config() runs BEFORE any test file's imports
// (like ../app, which transitively loads config/env.ts) are evaluated. Under
// Vitest's real ESM execution, a test file's own `dotenv.config()` call would
// run too late — all of that file's imports are fully evaluated first, no
// matter where the call is written textually. Vitest setupFiles run as a
// separate, prior step, so this avoids that trap.
