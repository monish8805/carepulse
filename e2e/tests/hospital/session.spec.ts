import { expect, test } from "@playwright/test";
import { GREETING, hospitalBackend } from "./backend";

const REFRESH = "POST /api/auth/refresh";

test("the session is restored once per page load, not on every navigation", async ({ page }) => {
  const { backend } = hospitalBackend();
  await backend.attach(page);
  await page.goto("/");
  await expect(page.getByText(GREETING)).toBeVisible();
  expect(backend.count(REFRESH)).toBe(1);

  const mark = backend.calls.length;
  await page.getByRole("link", { name: "Patients" }).first().click();
  await expect(page.getByText("Pat One")).toBeVisible();
  await page.getByRole("link", { name: "Access" }).first().click();
  await expect(page.getByText("Nina Nurse")).toBeVisible();

  expect(backend.count(REFRESH, mark)).toBe(0);
  // Permission flags are still re-read on every page.
  expect(backend.count("GET /api/auth/me", mark)).toBe(2);
});

test("an expired access token is renewed once and the requests retried", async ({ page }) => {
  const { backend, state } = hospitalBackend();
  await backend.attach(page);
  await page.goto("/");
  await expect(page.getByText(GREETING)).toBeVisible();

  state.tokenVersion++; // every token the app holds is now expired
  const mark = backend.calls.length;
  // /access fires /me, roles, pending requests and staff at once — all 401.
  await page.getByRole("link", { name: "Access" }).first().click();
  await expect(page.getByText("Nina Nurse")).toBeVisible();

  expect(backend.count(REFRESH, mark)).toBe(1);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("when the session can't be renewed, the page shows the logged-out state", async ({ page }) => {
  const { backend, state } = hospitalBackend();
  await backend.attach(page);
  await page.goto("/");
  await expect(page.getByText(GREETING)).toBeVisible();

  state.refreshWorks = false;
  state.tokenVersion++;
  await page.getByRole("link", { name: "Patients" }).first().click();

  await expect(page.getByText("Log in first")).toBeVisible();
  await expect(page.getByText("Pat One")).toHaveCount(0);
});

test("a permission revoked mid-session is honoured on the next click", async ({ page }) => {
  const { backend, state } = hospitalBackend();
  await backend.attach(page);
  await page.goto("/access");
  await expect(page.getByText("Nina Nurse")).toBeVisible();

  state.canViewPatients = false; // revoked server-side
  state.role = "staff";
  await page.getByRole("link", { name: "Patients" }).first().click();

  // The page re-reads /me before rendering, so the old flag is never shown.
  // (The route loader may still prefetch from the layout's last-known flags —
  // the backend refuses that with a 403, and nothing from it is rendered.)
  await expect(page.getByText("Only staff with the patient.view permission")).toBeVisible();
  await expect(page.getByText("Pat One")).toHaveCount(0);
});

test("logging out in one tab logs out the portal's other tabs, and login re-checks them", async ({ context }) => {
  const { backend } = hospitalBackend();
  await backend.attach(context);
  const tabA = await context.newPage();
  const tabB = await context.newPage();
  await tabA.goto("/");
  await expect(tabA.getByText(GREETING)).toBeVisible();
  await tabB.goto("/patients");
  await expect(tabB.getByText("Pat One")).toBeVisible();

  await tabA.getByRole("button", { name: /Ada Admin/ }).click();
  await tabA.getByRole("menuitem", { name: "Log out" }).click();
  await expect(tabA).toHaveURL(/\/login$/);
  await expect(tabB).toHaveURL(/\/login$/);
  expect(backend.count("POST /api/auth/logout")).toBe(1);

  await tabB.goto("/patients");
  await expect(tabB.getByText("Log in first")).toBeVisible();
  await tabA.getByLabel("Email").fill("ada@x.com");
  await tabA.getByLabel("Password").fill("password");
  await tabA.getByRole("button", { name: "Log in" }).click();
  await expect(tabA.getByText(GREETING)).toBeVisible();
  await expect(tabB.getByText("Pat One")).toBeVisible();
});
