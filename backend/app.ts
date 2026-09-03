import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import { corsOptions } from "./config/cors";
import healthRoutes from "./routes/health.routes";
import authRoutes from "./routes/auth.routes";
import hospitalRoutes from "./routes/hospital.routes";
import ownerRoutes from "./routes/owner.routes";
import patientRoutes from "./routes/patient.routes";
import { HttpError } from "./utils/httpError";

const app = express();

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/hospital", hospitalRoutes);
app.use("/api/owner", ownerRoutes);
app.use("/api/patient", patientRoutes);

// MongoDB's duplicate-key error. Every unique index in this app guards a
// real business rule (one membership per (user, hospital), one live
// membership per user, one AccessRole name per hospital, one consent per
// (patient, doctor), unique email), and every one of those has an
// application-level pre-check that produces a clean 409 — but a pre-check is
// read-then-write, so a genuine race still lands here. Without this branch it
// fell through to a generic 500, which meant the unique indexes the model
// comments call "the backstop" surfaced as an unexplained server error.
// Deliberately generic: err.keyValue holds the conflicting values (emails
// included), so it is never echoed back to the client or logged.
function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === 11000;
}

// Central error handler: validators and domain code throw HttpError, this is
// the only place that turns errors into HTTP responses.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.statusCode).json({ message: err.message });
    return;
  }

  if (isDuplicateKeyError(err)) {
    res.status(409).json({ message: "That already exists. Refresh and try again." });
    return;
  }
  // A malformed id (not a valid ObjectId, e.g. from a bad frontend link or a
  // client just poking at the API) throws Mongoose's CastError from any
  // findById/findOne({_id}) — catch it here, once, rather than validating id
  // format in every route that takes one.
  if (err instanceof mongoose.Error.CastError) {
    res.status(400).json({ message: "Invalid ID format." });
    return;
  }
  console.error(err);
  res.status(500).json({ message: "Something went wrong." });
});

export default app;
