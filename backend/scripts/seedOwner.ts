// Creates the initial Platform Owner account. Run once with: npm run seed:owner
//
// Credentials come from the environment, never from this file: this script
// creates the highest-privilege account in the system, so a hardcoded default
// here would be a committed production credential (and the previous one was
// "123456"). Set OWNER_EMAIL and OWNER_PASSWORD in backend/.env first.
import dotenv from "dotenv";
dotenv.config(); // must run before any other local import that reads process.env at load time

import mongoose from "mongoose";
import { connectToDatabase } from "../config/db";
import { UserModel } from "../models/user.model";
import { hashValue } from "../utils/hash";

const OWNER_EMAIL = process.env.OWNER_EMAIL;
const OWNER_PASSWORD = process.env.OWNER_PASSWORD;

async function seedOwner() {
  if (!OWNER_EMAIL || !OWNER_PASSWORD) {
    console.error("Set OWNER_EMAIL and OWNER_PASSWORD in backend/.env before running this script.");
    process.exit(1);
  }

  await connectToDatabase();

  const existingOwner = await UserModel.findOne({ email: OWNER_EMAIL });
  if (existingOwner) {
    console.log(`Owner account already exists for ${OWNER_EMAIL}.`);
    await mongoose.disconnect();
    return;
  }

  const passwordHash = await hashValue(OWNER_PASSWORD);
  await UserModel.create({
    name: "Platform Owner",
    email: OWNER_EMAIL,
    passwordHash,
    roles: ["owner"],
    isVerified: true,
  });

  console.log(`Owner account created for ${OWNER_EMAIL}.`);
  await mongoose.disconnect();
}

seedOwner().catch((error) => {
  console.error("Failed to seed owner account:", error);
  process.exit(1);
});
