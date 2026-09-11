import createHttpError from 'http-errors'
import { RateLimiter } from '@data-stores/valkey-rate-limiter'
import {
  EmailDomainInvalidError,
  EmailFormatInvalidError,
  sanitizeEmailAddress,
} from '@services/email-address-validator'
import {
  createDeviceAndSessionTokens,
  getEnrichedSessionClaims,
  type DeviceClass,
  type DeviceContext,
} from '@services/jwt-session'
import { createLoginAttempt, userHasMfa } from '@services/mfa'
import { normalizeUiLocale } from '@ts-shared/languages/ui-locales'
import { upsertUser } from './create.mts'
import {
  createEmailAddressLoginToken,
  enqueueEmailAddressLoginToken,
  verifyEmailAddressLoginToken,
} from './authentication.mts'

const emailTokenRateLimiter = new RateLimiter({
  prefix: 'email-address-login-token',
  ttlSeconds: 60,
})

// Exported so tests can seed this exact ZSET key (same prefix + same client) instead of racing
// the real 60s sliding window with slow sequential HTTP round-trips.
export const EMAIL_LOGIN_VERIFY_RATE_LIMIT_PREFIX = 'email-address-login-verify'
export const EMAIL_LOGIN_VERIFY_RATE_LIMIT_THRESHOLD = 10
export const EMAIL_LOGIN_VERIFY_RATE_LIMIT_TTL_SECONDS = 60

const emailLoginVerifyRateLimiter = new RateLimiter({
  prefix: EMAIL_LOGIN_VERIFY_RATE_LIMIT_PREFIX,
  ttlSeconds: EMAIL_LOGIN_VERIFY_RATE_LIMIT_TTL_SECONDS,
})

export async function requestEmailAddressLoginToken(options: {
  emailAddress: string
  ip?: string
  deviceId?: string
  sessionId?: string
  uiLocale?: string | null
}): Promise<{ emailAddress: string }> {
  const sanitizedEmail = sanitizeEmailAddress(options.emailAddress)
  const rateLimitIds = [sanitizedEmail, options.ip, options.deviceId, options.sessionId].filter(
    (id): id is string => typeof id === 'string',
  )

  const { limited } = await emailTokenRateLimiter.addAndCheck(rateLimitIds, 5)
  if (limited) throw createHttpError(429, 'Too many requests. Please try again later.')

  try {
    const { token, emailAddress } = await createEmailAddressLoginToken(options.emailAddress)
    enqueueEmailAddressLoginToken(emailAddress, token, normalizeUiLocale(options.uiLocale))
    return { emailAddress }
  } catch (error) {
    throw mapEmailAuthenticationError(error)
  }
}

export async function loginWithEmailAddressToken(options: {
  emailAddress: string
  token: string
  ip?: string
  deviceId: string
  sessionId: string
  deviceClass?: DeviceClass
  deviceContext?: DeviceContext
}) {
  try {
    const sanitizedEmail = sanitizeEmailAddress(options.emailAddress)
    const rateLimitIds = [sanitizedEmail, options.ip, options.deviceId, options.sessionId].filter(
      (id): id is string => typeof id === 'string',
    )

    const { limited } = await emailLoginVerifyRateLimiter.addAndCheck(
      rateLimitIds,
      EMAIL_LOGIN_VERIFY_RATE_LIMIT_THRESHOLD,
    )
    if (limited) throw createHttpError(429, 'Too many requests. Please try again later.')

    const { success, emailAddress } = await verifyEmailAddressLoginToken(
      options.emailAddress,
      options.token,
    )
    if (!success) throw createHttpError(401, 'Invalid email address or one-time password')

    const user = await upsertUser({
      deviceId: options.deviceId,
      sessionId: options.sessionId,
      emailAddress,
      ipAddress: options.deviceContext?.ip_address,
      userAgent: options.deviceContext?.user_agent,
    })

    const claims = await getEnrichedSessionClaims(user)
    if (claims?.suspended) throw createHttpError(403, 'Account suspended')

    if (await userHasMfa(user.id)) {
      const loginAttemptId = await createLoginAttempt({
        userId: user.id,
        deviceId: options.deviceId,
        sessionId: options.sessionId,
        deviceClass: options.deviceClass,
      })
      return { mfaRequired: true as const, loginAttemptId }
    }

    const tokens = await createDeviceAndSessionTokens({
      did: options.deviceId,
      uid: user.id,
      roles: claims?.roles,
      membershipPlan: claims?.membershipPlan,
      membershipExpiresAt: claims?.membershipExpiresAt,
      trustTier: claims?.trustTier,
      uiLocale: claims?.uiLocale,
      deviceClass: options.deviceClass,
      deviceContext: options.deviceContext,
    })

    return {
      mfaRequired: false as const,
      user,
      deviceToken: tokens.deviceToken,
      sessionToken: tokens.sessionToken,
    }
  } catch (error) {
    throw mapEmailAuthenticationError(error)
  }
}

function mapEmailAuthenticationError(error: unknown): Error {
  if (error instanceof EmailDomainInvalidError && error.reason === 'disposable') {
    return createHttpError(
      422,
      'Please use a permanent email address. Disposable email providers are not supported.',
    )
  }
  if (error instanceof EmailFormatInvalidError || error instanceof EmailDomainInvalidError) {
    return createHttpError(422, error.message)
  }
  return error instanceof Error ? error : new Error(String(error))
}
