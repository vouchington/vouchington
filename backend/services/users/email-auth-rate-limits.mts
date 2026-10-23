import createHttpError from 'http-errors'
import { RateLimiter } from '@data-stores/valkey-rate-limiter'

const emailTokenRateLimiter = new RateLimiter({
  prefix: 'email-address-login-token',
  ttlSeconds: 60,
})
export const EMAIL_LOGIN_VERIFY_RATE_LIMIT_PREFIX = 'email-address-login-verify'
export const EMAIL_LOGIN_VERIFY_RATE_LIMIT_THRESHOLD = 10
export const EMAIL_LOGIN_VERIFY_RATE_LIMIT_TTL_SECONDS = 60
const emailLoginVerifyRateLimiter = new RateLimiter({
  prefix: EMAIL_LOGIN_VERIFY_RATE_LIMIT_PREFIX,
  ttlSeconds: EMAIL_LOGIN_VERIFY_RATE_LIMIT_TTL_SECONDS,
})

type EmailAuthenticationRateLimitIdentity = {
  emailAddress: string
  ip?: string
  deviceId?: string
  sessionId?: string
}

export async function assertEmailTokenRequestAllowed(
  identity: EmailAuthenticationRateLimitIdentity,
): Promise<void> {
  const { limited } = await emailTokenRateLimiter.addAndCheck(getRateLimitIds(identity), 5)
  if (limited) throw createHttpError(429, 'Too many requests. Please try again later.')
}

export async function assertEmailTokenVerificationAllowed(
  identity: EmailAuthenticationRateLimitIdentity,
): Promise<void> {
  const { limited } = await emailLoginVerifyRateLimiter.addAndCheck(
    getRateLimitIds(identity),
    EMAIL_LOGIN_VERIFY_RATE_LIMIT_THRESHOLD,
  )
  if (limited) throw createHttpError(429, 'Too many requests. Please try again later.')
}

function getRateLimitIds(identity: EmailAuthenticationRateLimitIdentity): string[] {
  return [identity.emailAddress, identity.ip, identity.deviceId, identity.sessionId].filter(
    (id): id is string => typeof id === 'string',
  )
}
