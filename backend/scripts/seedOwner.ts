// Creates the initial Platform Owner account. Run once with: npm run seed:owner
import dotenv from "dotenv";
dotenv.config(); // must run before any other local import that reads process.env at load time

import mongoose from "mongoose";
import { connectToDatabase } from "../config/db";
import { UserModel } from "../models/user.model";
import { hashValue } from "../utils/hash";

const OWNER_EMAIL = "monureddig@gmail.com";
const OWNER_PASSWORD = "123456";

async function seedOwner() {
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
