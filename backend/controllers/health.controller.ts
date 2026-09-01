import { Request, Response } from "express";
import mongoose from "mongoose";

const dbStates: string[] = ["disconnected", "connected", "connecting", "disconnecting"];

export function getHealth(_req: Request, res: Response) {
  res.json({
    status: "ok",
    database: dbStates[mongoose.connection.readyState] ?? "unknown",
  });
}
