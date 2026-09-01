// Generates a random 6-digit OTP code, e.g. "042917".
export function generateOtpCode(): string {
  const code = Math.floor(100000 + Math.random() * 900000);
  return code.toString();
}

export const OTP_EXPIRES_IN_MINUTES = 10;
