import { RateLimiter } from '@data-stores/valkey-rate-limiter'
import createHttpError from 'http-errors'

const MAX_FAILURES = 6
const failedTotpReAuthRateLimiter = new RateLimiter({
  prefix: 'mfa-reauth-totp-failures',
  ttlSeconds: 300,
})

export async function countTotpReAuthAttempt(userId: string): Promise<void> {
  // The limiter rejects at its inclusive threshold. Permit the full factor-check budget
  // before rejecting the next attempt, including concurrent requests.
  const { limited } = await failedTotpReAuthRateLimiter.addAndCheck([userId], MAX_FAILURES + 1)
  if (limited)
    throw createHttpError(429, 'Too many invalid verification codes. Please try again later.')
}

export async function clearTotpReAuthAttempts(userId: string): Promise<void> {
  await failedTotpReAuthRateLimiter.delete(userId)
}
