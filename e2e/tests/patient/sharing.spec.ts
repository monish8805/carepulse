import { expect, test } from "@playwright/test";
import { FakeBackend, json } from "../../fakeBackend";
import { PATIENT } from "./patient";

const DOCTOR = { doctorId: "d1", name: "Dr Dee", specialization: "Cardiology", hospitalName: "City Hospital" };

type Grant = {
  id: string;
  doctorId: string;
  doctorName: string;
  doctorSpecialization: string | null;
  hospitalName: string | null;
  dataCategories: string[];
  status: "active" | "revoked";
  createdAt: string;
};

function patientBackend(delayMs = 0) {
  const state = { grants: [] as Grant[] };
  const backend = new FakeBackend(
    {
      "POST /api/auth/refresh": () => json({ accessToken: "t", user: PATIENT }),
      "GET /api/patient/doctors": (request) =>
        new URL(request.url()).searchParams.get("email") === "doc@x.com"
          ? json({ doctor: DOCTOR })
          : json({ message: "No doctor found with that email." }, 404),
      "GET /api/patient/consents": () => json({ grants: state.grants }),
      "POST /api/patient/consents": (request) => {
        const { dataCategories } = request.postDataJSON();
        const grant: Grant = {
          id: "g1",
          doctorId: DOCTOR.doctorId,
          doctorName: DOCTOR.name,
          doctorSpecialization: DOCTOR.specialization,
          hospitalName: DOCTOR.hospitalName,
          dataCategories,
          status: "active",
          createdAt: "2026-09-01T00:00:00Z",
        };
        state.grants = [grant];
        return json({ grant }, 201);
      },
      "POST /api/patient/consents/:id/revoke": () => {
        state.grants = state.grants.map((g) => ({ ...g, status: "revoked" }));
        return json({ message: "ok" });
      },
    },
    delayMs
  );
  return { backend, state };
}

test("a failed lookup is shown inline", async ({ page }) => {
  const { backend } = patientBackend();
  await backend.attach(page);
  await page.goto("/sharing");

  await page.getByLabel("Doctor's email").fill("nobody@x.com");
  await page.getByRole("button", { name: "Look up" }).click();
  await expect(page.getByText("No doctor found with that email.")).toBeVisible();
});

test("access is granted to the looked-up email, never to what was typed afterwards", async ({ page }) => {
  const { backend } = patientBackend();
  await backend.attach(page);
  await page.goto("/sharing");
  const emailInput = page.getByLabel("Doctor's email");

  await emailInput.fill("doc@x.com");
  await page.getByRole("button", { name: "Look up" }).click();
  await expect(page.getByText("Dr Dee")).toBeVisible();

  // Editing the address discards the confirmed doctor entirely.
  await emailInput.fill("someone-else@x.com");
  await expect(page.getByRole("checkbox")).toHaveCount(0);

  await emailInput.fill("doc@x.com");
  await page.getByRole("button", { name: "Look up" }).click();
  await page.getByRole("checkbox").first().check();
  const grantRequest = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/api/patient/consents"));
  await page.getByRole("button", { name: "Grant access" }).click();

  expect((await grantRequest).postDataJSON().doctorEmail).toBe("doc@x.com");
  await expect(page.getByRole("status").filter({ hasText: "Access granted to Dr Dee." })).toBeVisible();
});

test("revoke shows instantly and rolls back if the server refuses", async ({ page }) => {
  const { backend, state } = patientBackend(800);
  state.grants = [
    {
      id: "g1",
      doctorId: "d1",
      doctorName: "Dr Dee",
      doctorSpecialization: "Cardiology",
      hospitalName: "City Hospital",
      dataCategories: ["vitals.continuous"],
      status: "active",
      createdAt: "2026-09-01T00:00:00Z",
    },
  ];
  backend.on({ "POST /api/patient/consents/:id/revoke": () => json({ message: "Grant not found." }, 404) });
  await backend.attach(page);
  await page.goto("/sharing");

  await page.getByRole("button", { name: "Revoke" }).click();
  await page.getByRole("button", { name: "Revoke access" }).click();

  // The row's Revoke action disappears as soon as it reads as revoked.
  await expect(page.getByRole("button", { name: "Revoke", exact: true })).toHaveCount(0, { timeout: 500 });
  await expect(page.getByRole("alert").filter({ hasText: "Grant not found." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Revoke", exact: true })).toHaveCount(1);
});
