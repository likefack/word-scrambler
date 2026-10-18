import 'server-only';
import { env } from 'cloudflare:workers';
import { OWNER_KEY_MODE_ENABLED } from './features';

const GROQ_KEY_FORMAT = /^gsk_[A-Za-z0-9_-]{20,250}$/;

export function isGroqApiKey(value: string): boolean {
  return GROQ_KEY_FORMAT.test(value);
}

/** Runtime-only Sites secret binding. Never import this module from client code. */
export function getOwnerGroqApiKey(): string | undefined {
  if (!OWNER_KEY_MODE_ENABLED) return undefined;
  const value = (env as { GROQ_OWNER_API_KEY?: unknown }).GROQ_OWNER_API_KEY;
  const key = typeof value === 'string' ? value.trim() : '';
  return isGroqApiKey(key) ? key : undefined;
}

// Best-effort limits for this worker instance, not a global quota or spend cap.
// Attempts, including upstream failures, count toward the hourly allowance.
const OWNER_COOLDOWN_MS = 10_000;
const OWNER_WINDOW_MS = 60 * 60_000;
const OWNER_REQUESTS_PER_WINDOW = 30;
let ownerActive = false;
let lastOwnerAttempt: number | undefined;
let ownerAttempts: number[] = [];

type OwnerAdmission =
  | { allowed: true; release: () => void }
  | { allowed: false; code: 'OWNER_BUSY' | 'OWNER_RATE_LIMIT'; retryAfter: number };

export function reserveOwnerRequest(now = Date.now()): OwnerAdmission {
  if (ownerActive) return { allowed: false, code: 'OWNER_BUSY', retryAfter: 10 };
  ownerAttempts = ownerAttempts.filter(at => now - at < OWNER_WINDOW_MS);
  const cooldownRemaining = lastOwnerAttempt === undefined ? 0 : OWNER_COOLDOWN_MS - (now - lastOwnerAttempt);
  const windowRemaining = ownerAttempts.length >= OWNER_REQUESTS_PER_WINDOW
    ? OWNER_WINDOW_MS - (now - ownerAttempts[0]) : 0;
  const wait = Math.max(cooldownRemaining, windowRemaining);
  if (wait > 0) return { allowed: false, code: 'OWNER_RATE_LIMIT', retryAfter: Math.ceil(wait / 1000) };

  ownerActive = true;
  lastOwnerAttempt = now;
  ownerAttempts.push(now);
  let released = false;
  return { allowed: true, release() {
    if (!released) { ownerActive = false; released = true; }
  } };
}
