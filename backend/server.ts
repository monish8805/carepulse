import dotenv from "dotenv";
dotenv.config(); // must run before any other local import that reads process.env at load time

import app from "./app";
import { connectToDatabase } from "./config/db";
import { PORT } from "./config/env";

async function startServer() {
  await connectToDatabase();

  app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
  });
}

startServer();
