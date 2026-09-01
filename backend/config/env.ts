// Centralized env var access. server.ts (and scripts) call dotenv.config()
// before importing anything else, so these reads are always safe.
export const PORT = process.env.PORT || "5001";
export const MONGODB_URI = process.env.MONGODB_URI || "";
export const NODE_ENV = process.env.NODE_ENV || "development";
export const IS_PRODUCTION = NODE_ENV === "production";

export const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:3001")
  .split(",")
  .map((origin) => origin.trim());

export const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

export const BREVO_API_KEY = process.env.BREVO_API_KEY;
export const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || "no-reply@carepulse.dev";
export const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || "CarePulse";
