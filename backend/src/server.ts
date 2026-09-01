import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectToDatabase } from "./config/db";

dotenv.config();

const app = express();
const port = process.env.PORT || 5001;
const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";

app.use(cors({ origin: frontendUrl }));
app.use(express.json());

// Simple health-check endpoint so the frontend can confirm the backend is running.
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

async function startServer() {
  await connectToDatabase();

  app.listen(port, () => {
    console.log(`Backend server running on http://localhost:${port}`);
  });
}

startServer();
