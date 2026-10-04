import { expect, test } from "@playwright/test";
import { defaultState, hospitalBackend } from "./backend";
import { ageInYears } from "../patient/patient";

const DISCLAIMER = /research prototype/i;

test("the Alerts link only shows for staff who hold alerts.view", async ({ page }) => {
  const { backend, state } = hospitalBackend({ role: "staff", canViewAlerts: false });
  await backend.attach(page);
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Patients" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Alerts" })).toHaveCount(0);

  await page.goto("/alerts");
  await expect(page.getByText("Only staff with the alerts.view permission")).toBeVisible();
  expect(backend.count("GET /api/hospital/alerts")).toBe(0);

  state.canViewAlerts = true;
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Alerts" }).first()).toBeVisible();
});

test("an alert shows the reading that triggered it next to the patient's current score", async ({ page }) => {
  const { backend } = hospitalBackend();
  await backend.attach(page);
  await page.goto("/alerts");
  const time = (iso: string) =>
    page.evaluate(
      (value) => new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
      iso
    );

  const triggered = page.getByText("Triggered by").locator("..");
  await expect(triggered).toContainText("HIGH");
  await expect(triggered).toContainText("7.1%");
  await expect(triggered).toContainText(`reading of ${await time("2026-10-03T05:00:00Z")}`);

  const current = page.getByText("Current", { exact: true }).locator("..");
  await expect(current).toContainText("ELEVATED");
  await expect(current).toContainText("4.1%");
  await expect(current).toContainText(`reading of ${await time("2026-10-03T08:00:00Z")}`);

});

test("an alert is listed with the disclaimer and goes away once the server confirms the acknowledgement", async ({ page }) => {
  const { backend } = hospitalBackend({}, 600);
  await backend.attach(page);
  await page.goto("/alerts");
  await expect(page.getByText("Pat One")).toBeVisible();
  await expect(page.getByText(DISCLAIMER)).toBeVisible();

  await page.getByRole("button", { name: "Acknowledge" }).click();
  // Not optimistic: the row stays (button disabled) until the server answers.
  await expect(page.getByRole("button", { name: "Acknowledging..." })).toBeDisabled();
  await expect(page.getByText("Pat One")).toBeVisible();
  await expect(page.getByText("No active alerts")).toBeVisible();
  expect(backend.count("POST /api/hospital/alerts/a1/acknowledge")).toBe(1);
});

test("without alerts.acknowledge there is no Acknowledge button", async ({ page }) => {
  const { backend } = hospitalBackend({ role: "staff", canAcknowledgeAlerts: false });
  await backend.attach(page);
  await page.goto("/alerts");
  await expect(page.getByText("Pat One")).toBeVisible();
  await expect(page.getByRole("button", { name: "Acknowledge" })).toHaveCount(0);
});

test("a patient's vitals page opens from the list only for continuous-vitals grants", async ({ page }) => {
  const { backend } = hospitalBackend({
    patients: [
      ...defaultState().patients,
      {
        id: "g2",
        patientId: "p2",
        patientName: "Sam Occasional",
        patientDateOfBirth: null,
        patientGender: null,
        dataCategories: ["vitals.occasional"],
        createdAt: "2026-09-02T00:00:00Z",
      },
    ],
  });
  await backend.attach(page);
  await page.goto("/patients");
  await expect(page.getByText("Sam Occasional")).toBeVisible();
  await expect(page.getByRole("link", { name: "View vitals" })).toHaveCount(1);

  await page.getByRole("link", { name: "View vitals" }).click();
  await expect(page).toHaveURL(/\/patients\/p1$/);
  await expect(page.getByRole("heading", { name: "Pat One" })).toBeVisible();
  await expect(page.getByText(DISCLAIMER)).toBeVisible();
  await expect(page.getByText("7.1% estimated probability")).toBeVisible();
  await expect(page.getByRole("cell", { name: "118" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "ELEVATED" })).toBeVisible();
});

test("an unscored latest reading reads as unknown risk, never low", async ({ page }) => {
  const state = defaultState();
  state.vitals.predictions[1] = {
    ...state.vitals.predictions[1],
    status: "unavailable",
    sepsisProbability: null,
    riskLevel: null,
  };
  const { backend } = hospitalBackend({ vitals: state.vitals });
  await backend.attach(page);
  await page.goto("/patients/p1");
  const summary = page.locator("div.rounded-xl", { has: page.getByRole("heading", { name: "ML prediction summary" }) });
  await expect(summary.getByText("treat risk as unknown, not low")).toBeVisible();
  await expect(summary.getByText("UNKNOWN", { exact: true })).toBeVisible();
  await expect(summary.getByText("LOW", { exact: true })).toHaveCount(0);
});

test("without vitals.view the page doesn't ask for the data", async ({ page }) => {
  const { backend } = hospitalBackend({ role: "staff", canViewVitals: false });
  await backend.attach(page);
  await page.goto("/patients/p1");
  await expect(page.getByText("Only staff with the vitals.view permission")).toBeVisible();
  expect(backend.count("GET /api/hospital/patients/p1/vitals")).toBe(0);
});

test("the doctor's patient page shows age and gender, the ML summary, trends and the X-ray card", async ({ page }) => {
  const { backend } = hospitalBackend();
  await backend.attach(page);
  const age = `${ageInYears("1981-04-12T00:00:00.000Z")} years`;

  await page.goto("/patients");
  await expect(page.getByText(`${age} · Female`)).toBeVisible();

  await page.goto("/patients/p1");
  const info = page.locator("div.rounded-xl", { has: page.getByRole("heading", { name: "Patient information" }) });
  await expect(info.getByText(age)).toBeVisible();
  await expect(info.getByText("Female")).toBeVisible();
  await expect(info.getByText("O+")).toBeVisible();
  await expect(info.getByText("+91 98765 43210")).toBeVisible();

  const summary = page.locator("div.rounded-xl", { has: page.getByRole("heading", { name: "ML prediction summary" }) });
  await expect(summary.getByText("Prediction horizon")).toBeVisible();
  await expect(summary.getByText("Up to 6 h before sepsis onset")).toBeVisible();
  await expect(summary.getByText("Sepsis Early-Warning (SSL-LSTM) v1.0")).toBeVisible();
  await expect(summary.getByText("not a medical diagnosis")).toBeVisible();

  // Trends: ML risk first, with the tier axis; tabs swap the one chart shown.
  await expect(page.getByRole("tab", { name: "ML risk" })).toHaveAttribute("aria-selected", "true");
  const chart = page.getByRole("img", { name: /over time/ });
  await expect(chart).toHaveAttribute("aria-label", "ML risk over time, 2 readings");
  for (const tier of ["LOW", "ELEVATED", "HIGH"]) {
    await expect(chart.locator("text", { hasText: new RegExp(`^${tier}$`) })).toBeVisible();
  }
  await page.getByRole("tab", { name: "Blood pressure" }).click();
  await expect(chart).toHaveAttribute("aria-label", "Blood pressure over time, 2 readings");
  await expect(page.getByText("Systolic (SBP, mmHg)")).toBeVisible();
  await expect(chart.locator(".recharts-line")).toHaveCount(3);

  await expect(page.getByText("Upload Chest X-ray")).toBeVisible();
});

test("the trends and readings cards can be hidden and shown again", async ({ page }) => {
  const { backend } = hospitalBackend();
  await backend.attach(page);
  await page.goto("/patients/p1");

  const trendsToggle = page.getByRole("button", { name: /Trends \/ ML Analysis/ });
  const chart = page.getByRole("img", { name: /over time/ });
  await expect(trendsToggle).toHaveAttribute("aria-expanded", "true");
  await expect(chart).toBeVisible();
  await trendsToggle.click();
  await expect(trendsToggle).toHaveAttribute("aria-expanded", "false");
  await expect(trendsToggle).toContainText("Show");
  await expect(chart).toHaveCount(0);
  await trendsToggle.click();
  await expect(chart).toBeVisible();

  const readingsToggle = page.getByRole("button", { name: /^Readings/ });
  await expect(page.getByRole("cell", { name: "118" })).toBeVisible();
  await readingsToggle.click();
  await expect(page.getByRole("cell", { name: "118" })).toHaveCount(0);
  // The count stays visible while the table is hidden.
  await expect(page.getByText("2 reading(s), newest first.")).toBeVisible();
  await readingsToggle.click();
  await expect(page.getByRole("cell", { name: "118" })).toBeVisible();
});
