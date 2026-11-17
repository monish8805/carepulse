import { expect, test } from "@playwright/test";
import { hospitalBackend } from "./backend";

const FOOTER =
  "Research prototype trained on retrospective PhysioNet/CinC 2019 data. Not a diagnostic tool and not clinically validated; do not use for patient care decisions.";

test("the Sepsis Watch link needs both vitals.view and patient.view, and the page doesn't ask for data without them", async ({ page }) => {
  const { backend, state } = hospitalBackend({ role: "staff", canViewVitals: false });
  await backend.attach(page);
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Patients" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Sepsis Watch" })).toHaveCount(0);

  await page.goto("/sepsis-watch?patient=p1");
  await expect(page.getByText("Only staff with the vitals.view and patient.view permissions")).toBeVisible();
  expect(backend.count("GET /api/hospital/patients/:id/sepsis-watch")).toBe(0);

  state.canViewVitals = true;
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Sepsis Watch" }).first()).toBeVisible();
});

test("opening a patient shows the strips, summary, alert state and the honest footer; the cursor, model and replay work", async ({ page }) => {
  const { backend } = hospitalBackend();
  await backend.attach(page);
  await page.goto("/sepsis-watch");
  expect(backend.count("GET /api/hospital/patients/:id/sepsis-watch")).toBe(0);

  await page.getByLabel("Patient").selectOption("p1");
  await expect(page).toHaveURL(/patient=p1/);
  await expect(page.getByText("Stay length")).toBeVisible();
  await expect(page.getByText("12 h", { exact: true })).toBeVisible();
  await expect(page.getByText(/^Hour 11 of 11/)).toBeVisible();

  // Default model alerts at hours 6-8; onset at 13 → lead time 7 h.
  await expect(page.getByText("Hour 6", { exact: true })).toBeVisible();
  await expect(page.getByText("7 h", { exact: true })).toBeVisible();
  await expect(page.getByText("simulated retrospective stay", { exact: false })).toBeVisible();
  await expect(page.getByText("label starts at hour 7, defined onset at hour 13")).toBeVisible();

  // Slider moves every strip's cursor: hour 4 has no HR reading, so it is carried forward; hour 7 is an alert.
  const slider = page.getByRole("slider", { name: "Hour of stay" });
  await slider.fill("4");
  await expect(page.getByText("carried forward")).toBeVisible();
  await slider.fill("7");
  await expect(page.getByText("Alert", { exact: true })).toBeVisible();
  await slider.fill("2");
  await expect(page.getByText("Below alert level")).toBeVisible();
  await expect(page.getByText("Hour 0: Only 1 of 6")).toHaveCount(0);
  await slider.fill("0");
  await expect(page.getByText("Hour 0: Only 1 of 6 hours of history so far")).toBeVisible();

  // The other model alerts at hour 9 only.
  await page.getByRole("radio", { name: "XGBoost" }).click();
  await expect(page.getByText("Hour 9", { exact: true })).toBeVisible();

  // Replay runs from the cursor and stops by itself at the end.
  await slider.fill("9");
  await page.getByRole("button", { name: "Play replay" }).click();
  await expect(page.getByText(/^Hour 11 of 11/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Play replay" })).toBeVisible();

  await expect(page.getByText(FOOTER, { exact: true })).toBeVisible();
  await expect(page.getByText(/diagnos(is|ed)|sepsis detected/i).filter({ hasNotText: /not a diagnostic/i })).toHaveCount(0);
});

test("About this model shows the held-out test numbers", async ({ page }) => {
  const { backend } = hospitalBackend();
  await backend.attach(page);
  await page.goto("/sepsis-watch?patient=p1");
  await page.getByText("About this model").click();
  await expect(page.getByText(/AUROC 0\.701/)).toBeVisible();
  await expect(page.getByText(/precision is 7\.0%/)).toBeVisible();
  await expect(page.getByText(/most alerts\s+are false alarms/)).toBeVisible();
});

test("a patient who hasn't shared continuous vitals is a plain error, never data", async ({ page }) => {
  const { backend } = hospitalBackend();
  await backend.attach(page);
  await page.goto("/sepsis-watch?patient=nobody");
  await expect(page.getByText("Patient not found.")).toBeVisible();
  await expect(page.getByText("Stay length")).toHaveCount(0);
});
