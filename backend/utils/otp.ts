import { randomInt } from "crypto";

// Generates a random 6-digit OTP code, e.g. "429173".
//
// crypto.randomInt, NOT Math.random: this same code is the sole factor for
// both account verification and PASSWORD RESET, so a predictable generator is
// an account-takeover path (V8's Math.random is xorshift128+, and its internal
// state is recoverable from a handful of observed outputs — an attacker can
// harvest codes from throwaway accounts they control, then predict a victim's
// reset code). Range is [100000, 1000000) so every code is exactly 6 digits.
export function generateOtpCode(): string {
  return randomInt(100000, 1000000).toString();
}

export const OTP_EXPIRES_IN_MINUTES = 10;

// Wrong guesses allowed per issued code before it's discarded and the user has
// to request a new one. Without this a 6-digit code is only ~1e6 guesses and
// nothing else in the stack rate-limits the attempt (see the "not doing now"
// note about express-rate-limit) — the counter is what makes the expiry window
// meaningful rather than decorative.
export const OTP_MAX_ATTEMPTS = 5;
