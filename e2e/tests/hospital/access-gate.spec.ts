import { expect, test } from "@playwright/test";
import { GREETING, hospitalBackend } from "./backend";

test("an unaffiliated user requests access, waits, and gets in once approved", async ({ page }) => {
  const { backend, state } = hospitalBackend({ membership: null, hospitalSelected: false });
  await backend.attach(page);
  await page.goto("/");

  await expect(page.getByText("Let's get you set up")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);

  await page.getByRole("button", { name: "Request access" }).click();
  await expect(page.getByRole("button", { name: /Check again/ }).first()).toBeVisible();

  state.membership = "active"; // approved by an admin elsewhere
  await page.getByRole("button", { name: /Check again/ }).first().click();
  await expect(page.getByText(GREETING)).toBeVisible();
  expect(backend.count("POST /api/hospital/select")).toBe(1);
});

test("a request that didn't persist doesn't leave the user stuck on 'Permission sent'", async ({ page }) => {
  const { backend } = hospitalBackend({ membership: null, requestPersists: false });
  await backend.attach(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Request access" }).click();
  // The re-check returns the same "none" answer as before; the screen must
  // follow it back rather than keep showing the optimistic pending state.
  await expect(page.getByText("Let's get you set up")).toBeVisible();
});

test("a disabled membership is gated on the next load", async ({ page }) => {
  const { backend, state } = hospitalBackend();
  await backend.attach(page);
  await page.goto("/");
  await expect(page.getByText(GREETING)).toBeVisible();

  state.membership = "disabled";
  await page.reload();
  await expect(page.getByText("Access paused")).toBeVisible();
  await expect(page.getByText(GREETING)).toHaveCount(0);
});

test("active staff never download the gate's code", async ({ page }) => {
  const { backend } = hospitalBackend();
  const gateRequests: string[] = [];
  page.on("request", (r) => r.url().includes("HospitalAccessGate") && gateRequests.push(r.url()));
  await backend.attach(page);
  await page.goto("/");
  await expect(page.getByText(GREETING)).toBeVisible();
  expect(gateRequests).toEqual([]);
});
