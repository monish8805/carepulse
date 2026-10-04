import { expect, test } from "@playwright/test";
import { FakeBackend, json } from "../../fakeBackend";
import { PATIENT } from "./patient";

// A 1×1 PNG — enough for the browser to decode and preview.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

test("a prescription image is previewed locally, with analysis shown as not available yet", async ({ page }) => {
  await new FakeBackend({ "POST /api/auth/refresh": () => json({ accessToken: "t", user: PATIENT }) }).attach(page);
  const sent: string[] = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD"].includes(request.method())) sent.push(`${request.method()} ${request.url()}`);
  });

  await page.goto("/");
  await page.getByRole("link", { name: "Prescription" }).first().click();
  await expect(page.getByRole("heading", { name: "Upload Prescription" })).toBeVisible();
  await expect(page.getByText("Upload a clear image of the handwritten prescription")).toBeVisible();
  await expect(page.getByRole("button", { name: "Browse Files" })).toBeVisible();
  // The future result's shape is visible from the start, with nothing in it.
  for (const column of ["Medicine", "Dosage", "Frequency", "Duration"]) {
    await expect(page.getByRole("columnheader", { name: column })).toBeVisible();
  }
  await expect(page.getByRole("cell", { name: "—" })).toHaveCount(4);
  await expect(page.getByText("AI-extracted information will appear here after analysis.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Prescription Analysis" })).toHaveCount(0);
  const before = sent.length;

  const input = page.getByLabel("Prescription image");
  await input.setInputFiles({ name: "scan.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
  await expect(page.getByText(`"scan.pdf" isn't a JPG, JPEG or PNG image.`)).toBeVisible();

  await input.setInputFiles({ name: "rx.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByRole("img", { name: "Prescription: rx.png" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Original prescription" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Prescription Analysis" })).toBeVisible();
  await expect(page.getByText("AI analysis will be available soon.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Analyze Prescription" })).toBeDisabled();
  // Analysis hasn't run, so the result is still the empty placeholder.
  await expect(page.getByRole("cell", { name: "—" })).toHaveCount(4);

  await input.setInputFiles({ name: "rx-2.jpg", mimeType: "image/jpeg", buffer: PNG });
  await expect(page.getByRole("img", { name: "Prescription: rx-2.jpg" })).toBeVisible();

  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("heading", { name: "Upload Prescription" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Prescription Analysis" })).toHaveCount(0);

  // Drag and drop takes the same path.
  const dropped = await page.evaluateHandle((bytes) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], "dropped.jpeg", { type: "image/jpeg" }));
    return transfer;
  }, [...PNG]);
  await page.getByRole("heading", { name: "Upload Prescription" }).dispatchEvent("drop", { dataTransfer: dropped });
  await expect(page.getByRole("img", { name: "Prescription: dropped.jpeg" })).toBeVisible();

  expect(sent.slice(before)).toEqual([]);
});
