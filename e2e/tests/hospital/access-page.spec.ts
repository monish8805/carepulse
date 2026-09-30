import { expect, test } from "@playwright/test";
import { hospitalBackend } from "./backend";

test("hovering a link for 350ms preloads the page's code and data; a click inside 20s reuses it", async ({ page }) => {
  const { backend } = hospitalBackend();
  const codeRequests: string[] = [];
  page.on("request", (r) => r.url().includes("tsr-split") && codeRequests.push(new URL(r.url()).pathname));
  await page.clock.install();
  await backend.attach(page);
  await page.goto("/");
  await expect(page.getByText(/Good (morning|afternoon|evening)/)).toBeVisible();
  const accessLink = page.getByRole("link", { name: "Access" }).first();

  let mark = backend.calls.length;
  await accessLink.hover();
  await page.clock.runFor(200);
  await page.mouse.move(0, 0);
  await page.clock.runFor(500);
  expect(backend.count("GET /api/hospital/staff", mark)).toBe(0);

  await accessLink.hover();
  await page.clock.runFor(400);
  await expect.poll(() => backend.count("GET /api/hospital/staff", mark)).toBe(1);
  expect(codeRequests.some((path) => path.endsWith("access.tsx"))).toBe(true);

  mark = backend.calls.length;
  await accessLink.click();
  await expect(page.getByText("Nina Nurse")).toBeVisible();
  expect(backend.count("GET /api/hospital/staff", mark)).toBe(0);

  await page.getByRole("link", { name: "Home" }).first().click();
  await page.clock.fastForward(21_000);
  mark = backend.calls.length;
  await accessLink.click();
  await expect(page.getByText("Nina Nurse")).toBeVisible();
  await expect.poll(() => backend.count("GET /api/hospital/staff", mark)).toBe(1);
});

test("staff search is kept in the URL", async ({ page }) => {
  const { backend } = hospitalBackend();
  await backend.attach(page);
  await page.goto("/access");
  await expect(page.getByText("Nina Nurse")).toBeVisible();

  await page.getByLabel("Search staff").fill("omar");
  await expect(page).toHaveURL(/\?q=omar$/);
  await expect(page.getByText("Nina Nurse")).toHaveCount(0);

  await page.reload();
  await expect(page.getByLabel("Search staff")).toHaveValue("omar");
  await expect(page.getByText("Omar Ortho")).toBeVisible();
  await expect(page.getByText("Nina Nurse")).toHaveCount(0);
});

test("the Add staff modal's code loads on hover of its button", async ({ page }) => {
  const { backend } = hospitalBackend();
  const chunks: string[] = [];
  page.on("request", (r) => /AddStaffModal|ManageRolesPanel/.test(r.url()) && chunks.push(new URL(r.url()).pathname));
  await backend.attach(page);
  await page.goto("/access");
  await expect(page.getByText("Nina Nurse")).toBeVisible();
  expect(chunks).toEqual([]);

  await page.getByRole("button", { name: /Add staff/ }).hover();
  await expect.poll(() => chunks.some((c) => c.includes("AddStaffModal"))).toBe(true);
  await page.getByRole("button", { name: /Add staff/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("disable is instant; a refused remove stays in its confirmation dialog", async ({ page }) => {
  const { backend } = hospitalBackend({}, 1000);
  await backend.attach(page);
  await page.goto("/access");
  const nina = page.locator("li", { hasText: "Nina Nurse" });

  await nina.getByRole("button", { name: "Disable" }).click();
  await expect(nina.getByRole("button", { name: "Enable" })).toBeVisible({ timeout: 500 });
  await expect(page.getByRole("status").filter({ hasText: "Disabled Nina Nurse." })).toBeVisible();

  const omar = page.locator("li", { hasText: "Omar Ortho" });
  await omar.getByRole("button", { name: "Remove" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("dialog").getByText("You can't remove this staff member.")).toBeVisible();
  await expect(omar).toBeVisible();
});

test("giving up a patient's access is instant and rolls back on failure", async ({ page }) => {
  const { backend } = hospitalBackend({}, 800);
  backend.on({ "POST /api/hospital/patient-consents/:id/revoke": () => ({ status: 404, body: { message: "Grant not found." } }) });
  await backend.attach(page);
  await page.goto("/patients");
  await expect(page.getByText("Pat One")).toBeVisible();

  await page.getByRole("button", { name: "Give up access" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Give up access" }).click();
  await expect(page.getByText("Pat One")).toHaveCount(0, { timeout: 500 });
  await expect(page.getByRole("alert").filter({ hasText: "Grant not found." })).toBeVisible();
  await expect(page.getByText("Pat One")).toBeVisible();
});

test("a page that crashes while rendering shows the error screen, not a blank page", async ({ page }) => {
  const { backend } = hospitalBackend();
  backend.on({ "GET /api/hospital/staff": () => ({ body: { staff: [{ id: "broken" }] } }) });
  await backend.attach(page);
  await page.goto("/access");
  await expect(page.getByText("Something went wrong")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});
