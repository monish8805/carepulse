import { expect, test } from "@playwright/test";
import { FakeBackend, json } from "../../fakeBackend";

type Hospital = { id: string; name: string; isActive: boolean };

// A logged-in owner with two hospitals; every non-auth response is slowed down
// so "instant" optimistic updates are distinguishable from server round trips.
function ownerBackend(hospitals: Hospital[], delayMs = 800) {
  const state = { hospitals };
  const backend = new FakeBackend(
    {
      "POST /api/auth/refresh": () => json({ accessToken: "t", user: { id: "o1", name: "Olive Owner", email: "o@x.com" } }),
      "GET /api/owner/hospitals": () => json({ hospitals: state.hospitals }),
      "POST /api/owner/hospitals/:id/disable": (_, { id }) => {
        state.hospitals = state.hospitals.map((h) => (h.id === id ? { ...h, isActive: false } : h));
        return json({ message: "ok" });
      },
      "POST /api/owner/hospitals/:id/enable": (_, { id }) => {
        state.hospitals = state.hospitals.map((h) => (h.id === id ? { ...h, isActive: true } : h));
        return json({ message: "ok" });
      },
      "DELETE /api/owner/hospitals/:id": (_, { id }) => {
        state.hospitals = state.hospitals.filter((h) => h.id !== id);
        return json({ message: "ok" });
      },
      "POST /api/owner/hospitals": (request) => {
        const { hospitalName, adminEmail } = request.postDataJSON();
        const hospital = { id: "h3", name: hospitalName, isActive: true };
        state.hospitals = [...state.hospitals, hospital];
        return json({ hospital, admin: { id: "a", name: "Admin", email: adminEmail } }, 201);
      },
    },
    delayMs
  );
  return { backend, state };
}

const cityAndLake = (): Hospital[] => [
  { id: "h1", name: "City Hospital", isActive: true },
  { id: "h2", name: "Lake Clinic", isActive: true },
];

test("lists hospitals behind a skeleton, then creates one", async ({ page }) => {
  const { backend } = ownerBackend(cityAndLake());
  await backend.attach(page);
  await page.goto("/hospitals");

  await expect(page.getByRole("status").filter({ hasText: "Loading..." })).toBeVisible();
  await expect(page.getByText("City Hospital")).toBeVisible();

  await page.getByLabel("Hospital name").fill("River Care");
  await page.getByLabel("Administrator name").fill("Ada");
  await page.getByLabel("Administrator email").fill("ada@x.com");
  await page.getByRole("button", { name: "Create hospital" }).click();

  await expect(page.getByRole("status").filter({ hasText: 'Created "River Care"' })).toBeVisible();
  await expect(page.getByRole("list").getByText("River Care", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Hospital name")).toHaveValue("");
});

test("create failure stays inline in the form", async ({ page }) => {
  const { backend } = ownerBackend(cityAndLake(), 0);
  backend.on({ "POST /api/owner/hospitals": () => json({ message: "A hospital with that name already exists." }, 409) });
  await backend.attach(page);
  await page.goto("/hospitals");

  await page.getByLabel("Hospital name").fill("City Hospital");
  await page.getByLabel("Administrator name").fill("Ada");
  await page.getByLabel("Administrator email").fill("ada@x.com");
  await page.getByRole("button", { name: "Create hospital" }).click();

  await expect(page.locator("form").getByText("A hospital with that name already exists.")).toBeVisible();
});

test("disable flips the row before the server answers", async ({ page }) => {
  const { backend } = ownerBackend(cityAndLake(), 1500);
  await backend.attach(page);
  await page.goto("/hospitals");
  const row = page.locator("li", { hasText: "City Hospital" });

  await row.getByRole("button", { name: "Disable" }).click();
  // Well inside the 1.5s server delay.
  await expect(row.getByText("disabled")).toBeVisible({ timeout: 500 });
  await expect(page.getByRole("status").filter({ hasText: 'Disabled "City Hospital".' })).toBeVisible();
});

test("a rejected delete puts the row back and shows an error toast", async ({ page }) => {
  const { backend } = ownerBackend(cityAndLake(), 800);
  backend.on({ "DELETE /api/owner/hospitals/:id": () => json({ message: "Hospital is busy." }, 409) });
  await backend.attach(page);
  await page.goto("/hospitals");

  await page.locator("li", { hasText: "Lake Clinic" }).getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete hospital" }).click();

  await expect(page.locator("li", { hasText: "Lake Clinic" })).toHaveCount(0, { timeout: 500 });
  await expect(page.getByRole("alert").filter({ hasText: "Hospital is busy." })).toBeVisible();
  await expect(page.locator("li", { hasText: "Lake Clinic" })).toHaveCount(1);
});

test("logged-out visitors are asked to log in", async ({ page }) => {
  const backend = new FakeBackend({ "POST /api/auth/refresh": () => json({ message: "Not logged in." }, 401) });
  await backend.attach(page);
  await page.goto("/hospitals");
  await expect(page.getByText("to manage hospitals.")).toBeVisible();
});
