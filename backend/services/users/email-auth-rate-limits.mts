import createHttpError from 'http-errors'
import { RateLimiter } from '@data-stores/valkey-rate-limiter'
import { getEmailCodeRequestMinIntervalSeconds } from './email-auth-limits-config.mts'

const emailTokenRateLimiter = new RateLimiter({
  prefix: 'email-address-login-token',
  ttlSeconds: 60,
})
const EMAIL_LOGIN_VERIFY_RATE_LIMIT_PREFIX = 'email-address-login-verify'
const EMAIL_LOGIN_VERIFY_RATE_LIMIT_THRESHOLD = 10
const EMAIL_LOGIN_VERIFY_RATE_LIMIT_TTL_SECONDS = 60
const emailLoginVerifyRateLimiter = new RateLimiter({
  prefix: EMAIL_LOGIN_VERIFY_RATE_LIMIT_PREFIX,
  ttlSeconds: EMAIL_LOGIN_VERIFY_RATE_LIMIT_TTL_SECONDS,
})

const loginCodeIntervalLimiter = new RateLimiter({
  prefix: 'email-address-login-code-interval',
  ttlSeconds: 60,
})
const reAuthCodeIntervalLimiter = new RateLimiter({
  prefix: 'email-address-re-auth-code-interval',
  ttlSeconds: 60,
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

/**
 * Takes the one slot per interval for this email (login) or session (re-auth). `consume` charges
 * nothing when it refuses, so a refused request never extends the interval; it runs from the last
 * admitted send. Returns the interval so the response can tell clients when they may resend.
 */
export async function reserveEmailCodeRequestSlot(
  scope: 'login' | 'reauth',
  id: string,
): Promise<{ resendAfterSeconds: number }> {
  const resendAfterSeconds = getEmailCodeRequestMinIntervalSeconds()
  if (resendAfterSeconds === 0) return { resendAfterSeconds }
  const limiter = scope === 'login' ? loginCodeIntervalLimiter : reAuthCodeIntervalLimiter
  // Threshold 2 with cost 1 admits the first request and refuses a second inside the interval.
  const { limited, retryAfterMs } = await limiter.consume([id], {
    threshold: 2,
    cost: 1,
    ttlSeconds: resendAfterSeconds,
  })
  if (limited) {
    throw createHttpError(429, 'Please wait before requesting another code.', {
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    })
  }
  return { resendAfterSeconds }
}

/** Re-auth send: the 5-per-minute limits first, then the one-slot-per-interval session gate. */
export async function reserveReAuthEmailCodeRequest(
  identity: EmailAuthenticationRateLimitIdentity & { sessionId: string },
): Promise<{ resendAfterSeconds: number }> {
  await assertEmailTokenRequestAllowed(identity)
  return reserveEmailCodeRequestSlot('reauth', identity.sessionId)
}
