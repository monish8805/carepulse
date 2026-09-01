import { BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME } from "../config/env";

// Sends the OTP by email via Brevo, and always logs it to the console too.
// The console log means OTP flows can be tested locally even before Brevo
// is fully configured with a verified sender.
export async function sendOtpEmail(email: string, code: string, purpose: "register" | "reset"): Promise<void> {
  console.log(`[OTP] ${purpose} code for ${email}: ${code}`);

  if (!BREVO_API_KEY) {
    console.warn("BREVO_API_KEY is not set. Skipping actual email send.");
    return;
  }

  const subject =
    purpose === "register" ? "Verify your CarePulse account" : "Reset your CarePulse password";
  const heading = purpose === "register" ? "Your verification code" : "Your password reset code";

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: { email: BREVO_SENDER_EMAIL, name: BREVO_SENDER_NAME },
        to: [{ email }],
        subject,
        htmlContent: `<p>${heading}:</p><h2>${code}</h2><p>This code expires in 10 minutes.</p>`,
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
