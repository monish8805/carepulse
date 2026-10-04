import { expect, test } from "@playwright/test";
import { FakeBackend, json } from "../../fakeBackend";
import { PATIENT } from "./patient";

const READING = { O2Sat: 96, Temp: 38.4, SBP: 112, MAP: 76, DBP: 58, Resp: 22 };

function patientBackend(predictions: Record<string, unknown>[]) {
  return new FakeBackend({
    "POST /api/auth/refresh": () => json({ accessToken: "t", user: PATIENT }),
    "GET /api/patient/vitals": () =>
      json({
        readings: [
          { id: "v1", recordedAt: "2026-10-03T07:00:00Z", HR: 96, ...READING },
          { id: "v2", recordedAt: "2026-10-03T08:00:00Z", HR: 101, ...READING, Temp: null },
        ],
        predictions,
      }),
  });
}

const scored = (id: string, readingId: string, riskLevel: string, sepsisProbability: number) => ({
  id,
  readingId,
  status: "scored",
  sepsisProbability,
  riskLevel,
  modelKey: "ssl_lstm",
  modelVersion: "1.0",
  warning: null,
  createdAt: "2026-10-03T08:00:01Z",
});

test("the patient sees their readings, their current risk and the disclaimer", async ({ page }) => {
  const backend = patientBackend([scored("s1", "v1", "LOW", 0.012), scored("s2", "v2", "ELEVATED", 0.031)]);
  await backend.attach(page);
  await page.goto("/vitals");
  await expect(page.getByRole("heading", { name: "My Vitals" })).toBeVisible();
  await expect(page.getByText(/research prototype/i)).toBeVisible();
  await expect(page.getByText("3.1% estimated probability")).toBeVisible();
  await page.getByRole("button", { name: /^Readings/ }).click();
  await expect(page.getByRole("cell", { name: "101" })).toBeVisible();
  await expect(page.getByRole("link", { name: "My Vitals" }).first()).toBeVisible();
});

test("a reading the model couldn't score shows as unknown", async ({ page }) => {
  const backend = patientBackend([
    scored("s1", "v1", "LOW", 0.012),
    { ...scored("s2", "v2", "LOW", 0), status: "unavailable", riskLevel: null, sepsisProbability: null },
  ]);
  await backend.attach(page);
  await page.goto("/vitals");
  await expect(page.getByText("treat risk as unknown, not low")).toBeVisible();
});
