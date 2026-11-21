import { Request, Response } from "express";
import mongoose from "mongoose";
import { GIT_SHA } from "../config/env";

const dbStates: string[] = ["disconnected", "connected", "connecting", "disconnecting"];

export function getHealth(_req: Request, res: Response) {
  res.json({
    status: "ok",
    commit: GIT_SHA,
    database: dbStates[mongoose.connection.readyState] ?? "unknown",
  });
}
