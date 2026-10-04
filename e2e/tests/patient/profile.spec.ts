import { expect, test } from "@playwright/test";
import { FakeBackend, json } from "../../fakeBackend";
import { ageInYears, PATIENT } from "./patient";

// A 1×1 PNG — enough for the browser to decode and preview.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

function profileBackend(user: typeof PATIENT) {
  const state = { user, profileUpdates: [] as unknown[] };
  const backend = new FakeBackend({
    "POST /api/auth/refresh": () => json({ accessToken: "t", user: state.user }),
    "PATCH /api/patient/profile": (request) => {
      const body = request.postDataJSON();
      state.profileUpdates.push(body);
      state.user = {
        ...state.user,
        dateOfBirth: `${body.dateOfBirth}T00:00:00.000Z`,
        gender: body.gender,
        bloodType: body.bloodType,
        guardianPhone: body.guardianPhone || null,
      };
      return json({ message: "Profile updated.", user: state.user });
    },
  });
  return { backend, state };
}

test("a patient without a date of birth, gender and blood type must add them before using the portal", async ({ page }) => {
  const { backend, state } = profileBackend({ ...PATIENT, dateOfBirth: null, gender: null, bloodType: null });
  await backend.attach(page);
  await page.goto("/vitals");

  await expect(page.getByText("Before you continue")).toBeVisible();
  await expect(page.getByRole("link", { name: "My Vitals" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "My Vitals" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save and continue" })).toBeDisabled();

  await page.getByLabel("Date of birth").fill("1990-06-15");
  await page.getByLabel("Gender").selectOption("male");
  // Guardian phone is optional — blood type isn't, so Save stays off until it's chosen.
  await expect(page.getByRole("button", { name: "Save and continue" })).toBeDisabled();
  await page.getByLabel("Blood type").selectOption("unknown");
  await page.getByRole("button", { name: "Save and continue" }).click();

  await expect(page.getByRole("link", { name: "My Vitals" }).first()).toBeVisible();
  expect(state.profileUpdates).toEqual([
    { dateOfBirth: "1990-06-15", gender: "male", bloodType: "unknown", guardianPhone: "" },
  ]);
});

test("the home page shows the patient's profile, and it can be edited", async ({ page }) => {
  const { backend, state } = profileBackend(PATIENT);
  await backend.attach(page);
  await page.goto("/");
  const age = ageInYears(PATIENT.dateOfBirth!);
  await expect(page.getByText(`${age} years · Female · Blood type O+`)).toBeVisible();
  await expect(page.getByText("No guardian phone added")).toBeVisible();

  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Gender").selectOption("other");
  await page.getByLabel("Guardian phone (optional)").fill("+91 98765 43210");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect(page.getByText(`${age} years · Other · Blood type O+`)).toBeVisible();
  await expect(page.getByText("Guardian: +91 98765 43210")).toBeVisible();
  expect(state.profileUpdates).toEqual([
    { dateOfBirth: "1981-04-12", gender: "other", bloodType: "O+", guardianPhone: "+91 98765 43210" },
  ]);
});

test("a chest X-ray is previewed locally and never sent anywhere", async ({ page }) => {
  const { backend } = profileBackend(PATIENT);
  await backend.attach(page);
  const sent: string[] = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD"].includes(request.method())) sent.push(`${request.method()} ${request.url()}`);
  });
  await page.goto("/xray");
  await expect(page.getByText("Upload Chest X-ray")).toBeVisible();
  const before = sent.length;

  const input = page.locator('input[type="file"]');
  await input.setInputFiles({ name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
  await expect(page.getByText(`"notes.pdf" isn't a JPG, JPEG or PNG image.`)).toBeVisible();

  await input.setInputFiles({ name: "chest.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByRole("img", { name: "Chest X-ray preview: chest.png" })).toBeVisible();
  await expect(page.getByText("Analysis not available yet")).toBeVisible();

  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Upload Chest X-ray")).toBeVisible();

  // Drag and drop takes the same path.
  const dropped = await page.evaluateHandle((bytes) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], "dropped.jpg", { type: "image/jpeg" }));
    return transfer;
  }, [...PNG]);
  await page.getByText("Upload Chest X-ray").dispatchEvent("drop", { dataTransfer: dropped });
  await expect(page.getByRole("img", { name: "Chest X-ray preview: dropped.jpg" })).toBeVisible();

  expect(sent.slice(before)).toEqual([]);
});
