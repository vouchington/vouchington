import { beginTransaction } from '@data-stores/psql'
import { lockLoginCredentialAdmission } from '@services/oauth-accounts/login-admission'
import { getPrivateUserByAny } from './get.mts'
import createHttpError from 'http-errors'
import { awaitReportedEnqueueAdmission } from '@data-stores/valkey-glide-mq'
import {
  EmailDomainInvalidError,
  EmailFormatInvalidError,
  sanitizeEmailAddress,
} from '@services/email-address-validator'
import {
  createDeviceAndSessionTokens,
  getEnrichedSessionClaims,
  getSessionResponseUser,
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

import {
  assertEmailTokenRequestAllowed,
  assertEmailTokenVerificationAllowed,
} from './email-auth-rate-limits.mts'

export async function requestEmailAddressLoginToken(options: {
  emailAddress: string
  ip?: string
  deviceId?: string
  sessionId?: string
  uiLocale?: string | null
}): Promise<{ emailAddress: string }> {
  const sanitizedEmail = sanitizeEmailAddress(options.emailAddress)
  await assertEmailTokenRequestAllowed({ ...options, emailAddress: sanitizedEmail })

  try {
    const { token, emailAddress } = await createEmailAddressLoginToken(options.emailAddress)
    await awaitReportedEnqueueAdmission(() =>
      enqueueEmailAddressLoginToken(emailAddress, token, normalizeUiLocale(options.uiLocale)),
    )
    return { emailAddress }
  } catch (err) {
    throw mapEmailAuthenticationError(err)
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
  authOrigin?: 'web' | 'native'
}) {
  try {
    const sanitizedEmail = sanitizeEmailAddress(options.emailAddress)
    await assertEmailTokenVerificationAllowed({ ...options, emailAddress: sanitizedEmail })

    const { success, emailAddress } = await verifyEmailAddressLoginToken(
      options.emailAddress,
      options.token,
    )
    if (!success) throw createHttpError(401, 'Invalid email address or one-time password')

    const existing = await upsertUser({
      deviceId: options.deviceId,
      sessionId: options.sessionId,
      emailAddress,
      ipAddress: options.deviceContext?.ip_address,
      userAgent: options.deviceContext?.user_agent,
    })

    await using query = await beginTransaction()
    const firstFactor = { type: 'email' as const, emailAddress }
    await lockLoginCredentialAdmission(existing.id, firstFactor, query)
    const loaded = await getPrivateUserByAny(existing.id, { query })
    if (!loaded) throw createHttpError(401, 'Sign-in account no longer exists')
    const user = loaded
    const claims = await getEnrichedSessionClaims(user)

    if (await userHasMfa(user.id, { query })) {
      const loginAttemptId = await createLoginAttempt({
        firstFactor,
        userId: user.id,
        deviceId: options.deviceId,
        sessionId: options.sessionId,
        deviceClass: options.deviceClass,
        authOrigin: options.authOrigin,
      })
      await query.commit()
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
      authOrigin: options.authOrigin,
      query,
    })
    await query.commit()

    return {
      mfaRequired: false as const,
      user: getSessionResponseUser(user, tokens.sessionToken.payload),
      deviceToken: tokens.deviceToken,
      sessionToken: tokens.sessionToken,
    }
  } catch (err) {
    throw mapEmailAuthenticationError(err)
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
