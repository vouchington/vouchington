import createHttpError from 'http-errors'
import { AuthError } from '@vouchington/auth'
import { passkeyProtocol } from './protocol.mts'
import { toPasskeyAuthenticationOptions } from './options.mts'
import {
  createDeviceAndSessionTokens,
  getEnrichedSessionClaims,
  type DeviceClass,
  type DeviceContext,
  type FetchUserForSession,
} from '@services/jwt-session'

export async function getDiscoverablePasskeyAuthenticationOptions(deviceId: string) {
  if (!deviceId) throw createHttpError(400, 'Device ID is required')
  return toPasskeyAuthenticationOptions(
    await passkeyProtocol.authentication.createDiscoverableOptions(deviceId),
  )
}

export type DiscoverablePasskeyLogin = {
  userId: string
  deviceToken: { token: string; payload: { did: string; dc?: DeviceClass } }
  sessionToken: {
    token: string
    payload: {
      did: string
      sid: string
      uid: string | null
      rol?: readonly string[]
      mpl?: string | null
      tt?: number
      rca?: number
      sca?: number
    }
  }
}

export async function verifyDiscoverablePasskeyAuthentication(opts: {
  deviceId: string
  sessionId: string
  expectedOrigin: string
  response: unknown
  deviceClass?: DeviceClass
  deviceContext?: DeviceContext
  fetchUser: FetchUserForSession
}): Promise<DiscoverablePasskeyLogin> {
  if (!opts.deviceId) throw createHttpError(400, 'Device ID is required')
  if (!opts.sessionId) throw createHttpError(400, 'Session ID is required')

  let verification: { userId: string }
  try {
    verification = await passkeyProtocol.authentication.verifyDiscoverable({
      deviceId: opts.deviceId,
      expectedOrigin: opts.expectedOrigin,
      response: opts.response,
    })
  } catch (error) {
    return await throwDiscoverableAuthenticationError(error, opts)
  }

  /* v8 ignore start — success path requires a real WebAuthn ceremony (not unit-testable) */
  const user = await opts.fetchUser(verification.userId)
  const claims = user ? await getEnrichedSessionClaims(user) : null
  if (claims?.suspended) throw createHttpError(403, 'Account suspended')

  const tokens = await createDeviceAndSessionTokens({
    did: opts.deviceId,
    uid: verification.userId,
    roles: claims?.roles,
    membershipPlan: claims?.membershipPlan,
    membershipExpiresAt: claims?.membershipExpiresAt,
    trustTier: claims?.trustTier,
    uiLocale: claims?.uiLocale,
    deviceClass: opts.deviceClass,
    deviceContext: opts.deviceContext,
  })

  return {
    userId: verification.userId,
    deviceToken: tokens.deviceToken,
    sessionToken: tokens.sessionToken,
  }
  /* v8 ignore stop */
}

async function throwDiscoverableAuthenticationError(
  error: unknown,
  options: Pick<
    Parameters<typeof verifyDiscoverablePasskeyAuthentication>[0],
    'deviceId' | 'response'
  >,
): Promise<never> {
  if (!(error instanceof AuthError)) throw error
  if (error.code === 'challenge_expired') {
    throw createHttpError(400, 'Authentication challenge expired or not found')
  }
  if (error.code === 'rate_limited') {
    throw createHttpError(429, 'Too many failed sign-in attempts. Please try again later.')
  }
  if (error.code !== 'invalid_credentials') throw error
  if (!(options.response as { id?: unknown })?.id) {
    throw createHttpError(400, 'Invalid authentication response')
  }
  throw createHttpError(401, 'Passkey sign-in failed')
}
