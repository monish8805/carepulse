import mongoose from "mongoose";
import { MONGODB_URI } from "./env";

// Connects to MongoDB using the URI from the environment.
// Logs the result but does not crash the server if the connection fails,
// so the API can still run while the database is unavailable.
export async function connectToDatabase(): Promise<void> {
  if (!MONGODB_URI) {
    console.warn("MONGODB_URI is not set. Skipping database connection.");
    return;
  }

  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB");
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
  }
}
