import createHttpError from 'http-errors'
import {
  createDeviceAndSessionTokens,
  getEnrichedSessionClaims,
  type DeviceClass,
  type DeviceContext,
} from '@services/jwt-session'
import { createLoginAttempt, userHasMfa } from '@services/mfa'
import type { PrivateUser } from '@services/users'

export type OAuthFlowResult =
  | {
      mfaRequired: false
      user: PrivateUser
      deviceToken: Awaited<ReturnType<typeof createDeviceAndSessionTokens>>['deviceToken']
      sessionToken: Awaited<ReturnType<typeof createDeviceAndSessionTokens>>['sessionToken']
    }
  | {
      mfaRequired: true
      loginAttemptId: string
    }

export async function createOAuthFlowResultForUser(options: {
  user: PrivateUser
  deviceId: string
  sessionId: string
  authenticatedSessionId?: string
  refreshAuthenticatedSession?: boolean
  deviceClass?: DeviceClass
  deviceContext?: DeviceContext
  loginAttemptId?: string
}): Promise<OAuthFlowResult> {
  const result = await prepareOAuthFlowResultForUser(options)
  if (result.mfaRequired) return result
  return issuePreparedOAuthFlowResult({
    ...options,
    ...result,
  })
}

export async function prepareOAuthFlowResultForUser(options: {
  user: PrivateUser
  deviceId: string
  sessionId: string
  deviceClass?: DeviceClass
  loginAttemptId?: string
}) {
  const { user } = options
  const claims = await getEnrichedSessionClaims(user)
  if (claims?.suspended) throw createHttpError(403, 'Account suspended')

  if (await userHasMfa(user.id)) {
    const loginAttemptId = await createLoginAttempt(
      {
        userId: user.id,
        deviceId: options.deviceId,
        sessionId: options.sessionId,
        deviceClass: options.deviceClass,
      },
      options.loginAttemptId ? { id: options.loginAttemptId } : undefined,
    )
    return { mfaRequired: true as const, loginAttemptId }
  }

  return { mfaRequired: false as const, user, claims }
}

export async function issuePreparedOAuthFlowResult(options: {
  user: PrivateUser
  claims: Awaited<ReturnType<typeof getEnrichedSessionClaims>>
  deviceId: string
  authenticatedSessionId?: string
  refreshAuthenticatedSession?: boolean
  deviceClass?: DeviceClass
  deviceContext?: DeviceContext
}): Promise<Extract<OAuthFlowResult, { mfaRequired: false }>> {
  const tokens = await createDeviceAndSessionTokens({
    did: options.deviceId,
    sid: options.authenticatedSessionId,
    uid: options.user.id,
    eventType: options.refreshAuthenticatedSession ? 'refreshed_authenticated' : 'created',
    roles: options.claims?.roles,
    membershipPlan: options.claims?.membershipPlan,
    membershipExpiresAt: options.claims?.membershipExpiresAt,
    trustTier: options.claims?.trustTier,
    uiLocale: options.claims?.uiLocale,
    deviceClass: options.deviceClass,
    deviceContext: options.deviceContext,
  })

  return {
    mfaRequired: false,
    user: options.user,
    deviceToken: tokens.deviceToken,
    sessionToken: tokens.sessionToken,
  }
}
