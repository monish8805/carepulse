import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { corsOptions } from "./config/cors";
import healthRoutes from "./routes/health.routes";
import authRoutes from "./routes/auth.routes";
import hospitalRoutes from "./routes/hospital.routes";
import ownerRoutes from "./routes/owner.routes";
import { HttpError } from "./utils/httpError";

const app = express();

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/hospital", hospitalRoutes);
app.use("/api/owner", ownerRoutes);

// Central error handler: validators and domain code throw HttpError, this is
// the only place that turns errors into HTTP responses.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.statusCode).json({ message: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ message: "Something went wrong." });
});

export default app;
