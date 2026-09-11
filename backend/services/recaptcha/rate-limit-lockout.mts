import { rateLimiterValkeyClient } from '@data-stores/valkey/clients'
import { TimeUnit } from '@valkey/valkey-glide'
import onError from '@modules/on-error'

// When Google returns HTTP 429 (assessment quota exhausted) we stop calling the API for the rest of
// the UTC day so we neither spam the endpoint nor risk further billing. A single global Valkey key
// with a TTL that expires at midnight UTC implements the "one 429 per day is fine" rule from #4445.
const LOCKOUT_KEY = 'recaptcha:assessment-lockout'

export async function isRecaptchaLockedOut(): Promise<boolean> {
  // pttl returns -2 when the key is absent and -1 when it exists without a TTL; both mean "not
  // locked out". Any positive value means a lockout is still in effect.
  const ttl = await rateLimiterValkeyClient.pttl(LOCKOUT_KEY)
  return ttl > 0
}

export async function setRecaptchaLockedOut(): Promise<void> {
  await rateLimiterValkeyClient.set(LOCKOUT_KEY, '1', {
    expiry: { type: TimeUnit.Seconds, count: secondsUntilEndOfUtcDay() },
  })
}

// Fire-and-forget wrapper — safe to call from a catch block that cannot await.
export function setRecaptchaLockedOutBackground(): void {
  setRecaptchaLockedOut().catch(onError)
}

export function secondsUntilEndOfUtcDay(now: Date = new Date()): number {
  const endOfDayMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
    0,
  )
  const seconds = Math.ceil((endOfDayMs - now.getTime()) / 1000)
  // Valkey rejects a non-positive TTL; clamp to at least one second at the very end of the day.
  return Math.max(1, seconds)
}
