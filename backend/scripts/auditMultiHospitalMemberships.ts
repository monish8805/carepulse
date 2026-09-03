// Read-only diagnostic for the Phase 1 "one account = one hospital" migration.
// Finds every User who currently holds more than one "live" (pending/active/
// disabled) HospitalMembership — the state the new one-membership-per-user
// unique index will refuse to allow. Never mutates data; run with:
//   npm run audit:multi-hospital
import dotenv from "dotenv";
dotenv.config(); // must run before any other local import that reads process.env at load time

import mongoose from "mongoose";
import { connectToDatabase } from "../config/db";
import { UserModel } from "../models/user.model";
import { HospitalMembershipModel } from "../models/hospitalMembership.model";
import { HospitalModel } from "../models/hospital.model";

const LIVE_STATUSES = ["pending", "active", "disabled"];

async function audit() {
  await connectToDatabase();

  const liveMemberships = await HospitalMembershipModel.find({ status: { $in: LIVE_STATUSES } }).sort({
    createdAt: 1,
  });

  const byUserId = new Map<string, typeof liveMemberships>();
  for (const membership of liveMemberships) {
    const key = membership.userId.toString();
    const list = byUserId.get(key) ?? [];
    list.push(membership);
    byUserId.set(key, list);
  }

  const conflicts = [...byUserId.entries()].filter(([, memberships]) => memberships.length > 1);

  if (conflicts.length === 0) {
    console.log("No conflicts: every user has at most one live HospitalMembership.");
    await mongoose.disconnect();
    return;
  }

  console.log(`Found ${conflicts.length} user(s) with more than one live HospitalMembership:\n`);

  for (const [userId, memberships] of conflicts) {
    const user = await UserModel.findById(userId);
    console.log(`User: ${user?.name ?? "(deleted)"} <${user?.email ?? userId}> (${userId})`);
    for (const membership of memberships) {
      const hospital = await HospitalModel.findById(membership.hospitalId);
      console.log(
        `  - membership ${membership._id.toString()} | hospital: ${hospital?.name ?? "(deleted)"} (${membership.hospitalId.toString()}) | role: ${membership.role} | status: ${membership.status} | since: ${membership.createdAt?.toISOString()}`
      );
    }
    console.log("");
  }

  console.log("No data was changed. Decide which membership each user keeps, then re-run this script.");
  await mongoose.disconnect();
}

audit().catch((error) => {
  console.error("Audit failed:", error);
  process.exit(1);
});
