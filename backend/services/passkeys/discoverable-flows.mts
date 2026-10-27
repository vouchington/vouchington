import createHttpError from 'http-errors'
import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { getPasskeyByCredentialId } from './get.mts'
import { AuthError } from '@vouchington/auth'
import { passkeyProtocol } from './protocol.mts'
import { toPasskeyAuthenticationOptions } from './options.mts'
import {
  createDeviceAndSessionTokens,
  getEnrichedSessionClaims,
  type DeviceClass,
  type DeviceContext,
} from '@services/jwt-session'
import type { PrivateUser } from '@voucha/types/entities/user'

export async function getDiscoverablePasskeyAuthenticationOptions(deviceId: string) {
  if (!deviceId) throw createHttpError(400, 'Device ID is required')
  return toPasskeyAuthenticationOptions(
    await passkeyProtocol.authentication.createDiscoverableOptions(deviceId),
  )
}

export type DiscoverablePasskeyLogin = Awaited<ReturnType<typeof createDeviceAndSessionTokens>> & {
  userId: string
  deviceClass?: DeviceClass
}

export async function verifyDiscoverablePasskeyAuthentication(opts: {
  deviceId: string
  sessionId: string
  expectedOrigin: string
  response: unknown
  deviceClass?: DeviceClass
  deviceContext?: DeviceContext
  fetchUser: (userId: string, query: TransactionQuery) => Promise<PrivateUser | null>
}): Promise<DiscoverablePasskeyLogin> {
  if (!opts.deviceId) throw createHttpError(400, 'Device ID is required')
  if (!opts.sessionId) throw createHttpError(400, 'Session ID is required')

  let verification: { userId: string; passkeyId: string }
  try {
    verification = await passkeyProtocol.authentication.verifyDiscoverable({
      deviceId: opts.deviceId,
      expectedOrigin: opts.expectedOrigin,
      response: opts.response,
    })
  } catch (err) {
    return throwDiscoverableAuthenticationError(err, opts)
  }

  const mfaVerifiedAt = Math.floor(Date.now() / 1000)
  const credentialId = (opts.response as { id?: unknown })?.id
  if (typeof credentialId !== 'string') throw createHttpError(401, 'Passkey sign-in failed')
  await using query = await beginTransaction()
  const credential = await readAdmittedPasskey(verification, credentialId, query)
  if (!credential) throw createHttpError(401, 'Passkey sign-in failed')
  const user = await opts.fetchUser(verification.userId, query)
  if (!user || user.id !== verification.userId) throw createHttpError(401, 'Passkey sign-in failed')
  const tokens = await mintDiscoverableSession(user, opts, mfaVerifiedAt, query)
  await query.commit()

  return {
    userId: user.id,
    deviceToken: tokens.deviceToken,
    sessionToken: tokens.sessionToken,
  }
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

async function readAdmittedPasskey(
  verification: { userId: string; passkeyId: string },
  credentialId: string,
  query: TransactionQuery,
) {
  await query(
    '/* admitDiscoverablePasskeyLogin:userFence */ SELECT fn_lock_active_user_for_mutation($1)',
    [verification.userId],
  )
  await query(
    '/* admitDiscoverablePasskeyLogin:userRow */ SELECT id FROM users WHERE id = $1 FOR UPDATE',
    [verification.userId],
  )
  return getPasskeyByCredentialId(credentialId, {
    query,
    owner: { currentUserId: verification.userId, passkeyId: verification.passkeyId },
  })
}

async function mintDiscoverableSession(
  user: PrivateUser,
  opts: Parameters<typeof verifyDiscoverablePasskeyAuthentication>[0],
  mfaVerifiedAt: number,
  query: TransactionQuery,
) {
  const claims = await getEnrichedSessionClaims(user, { mfaVerifiedAt })

  return createDeviceAndSessionTokens({
    did: opts.deviceId,
    uid: user.id,
    roles: claims.roles,
    mfaVerifiedAt,
    membershipPlan: claims.membershipPlan,
    membershipExpiresAt: claims.membershipExpiresAt,
    trustTier: claims.trustTier,
    uiLocale: claims.uiLocale,
    deviceClass: opts.deviceClass,
    deviceContext: opts.deviceContext,
    query,
  })
}
