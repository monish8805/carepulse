import { BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME } from "../config/env";

async function sendEmail(to: string, subject: string, htmlContent: string): Promise<void> {
  if (!BREVO_API_KEY) {
    console.warn("BREVO_API_KEY is not set. Skipping actual email send.");
    return;
  }

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: { email: BREVO_SENDER_EMAIL, name: BREVO_SENDER_NAME },
        to: [{ email: to }],
        subject,
        htmlContent,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`Brevo email failed (${response.status}):`, body);
    }
  } catch (error) {
    console.error("Brevo email request failed:", error);
  }
}

// Sends the OTP by email via Brevo, and always logs it to the console too.
// The console log means OTP flows can be tested locally even before Brevo
// is fully configured with a verified sender.
export async function sendOtpEmail(email: string, code: string, purpose: "register" | "reset"): Promise<void> {
  console.log(`[OTP] ${purpose} code for ${email}: ${code}`);

  const subject =
    purpose === "register" ? "Verify your CarePulse account" : "Reset your CarePulse password";
  const heading = purpose === "register" ? "Your verification code" : "Your password reset code";

  await sendEmail(
    email,
    subject,
    `<p>${heading}:</p><h2>${code}</h2><p>This code expires in 10 minutes.</p>`
  );
}

// Sent once when the Owner provisions a hospital administrator. The temporary
// password is only ever transmitted this one time — the admin is expected to
// change it via the existing forgot-password flow.
export async function sendHospitalAdminWelcomeEmail(
  email: string,
  hospitalName: string,
  temporaryPassword: string
): Promise<void> {
  console.log(`[Hospital Admin] Temporary password for ${email} (${hospitalName}): ${temporaryPassword}`);

  await sendEmail(
    email,
    "You've been added as a CarePulse hospital administrator",
    `<p>You've been made an administrator for <strong>${hospitalName}</strong> on CarePulse.</p>
     <p>Temporary password: <strong>${temporaryPassword}</strong></p>
     <p>Log in at the Hospital Portal, and use "Forgot password" any time to set your own password.</p>`
  );
}
