import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { lockLoginCredentialAdmission } from '@services/oauth-accounts/login-admission'
import createHttpError from 'http-errors'
import {
  createDeviceAndSessionTokens,
  getEnrichedSessionClaims,
  type DeviceClass,
  type DeviceContext,
} from '@services/jwt-session'
import type { LoginAttempt } from './login-attempt.mts'
import type { PrivateUser } from '@voucha/types/entities/user'

export type VerifiedMfaFactor =
  | { type: 'totp'; authenticatorId: string; verifiedAt: number }
  | { type: 'passkey'; passkeyId: string; verifiedAt: number }

export type CompletedMfaLogin = Awaited<ReturnType<typeof createDeviceAndSessionTokens>> & {
  userId: string
  deviceClass?: DeviceClass
}

// `deviceClass` comes from the login attempt itself, captured when it was created for that
// same deviceId/sessionId -- never re-derived from whatever session happens to be attached to
// the request that completes MFA, since that request can come from a different device than the
// one that started the login.
//
// The caller supplies its user reader so this service can reload under the admission
// transaction without creating a users<->mfa workspace cycle. Both verified factor
// identities stay owned under the lifecycle fence until the new authority commits.
export async function completeMfaLoginWithContext(
  attempt: LoginAttempt,
  fetchUser: (userId: string, query: TransactionQuery) => Promise<PrivateUser | null>,
  factor: VerifiedMfaFactor,
  deviceContext?: DeviceContext,
): Promise<CompletedMfaLogin> {
  await using query = await beginTransaction()
  const user = await readAdmittedMfaUser(attempt, factor, fetchUser, query)
  if (!user || user.id !== attempt.userId) {
    throw createHttpError(401, 'Login attempt expired or invalid')
  }
  const tokens = await mintVerifiedMfaSession(user, attempt, factor, deviceContext, query)
  await query.commit()
  return {
    userId: user.id,
    deviceClass: tokens.deviceToken.payload.dc,
    deviceToken: tokens.deviceToken,
    sessionToken: tokens.sessionToken,
  }
}

async function assertMfaFactorStillOwned(
  currentUserId: string,
  factor: VerifiedMfaFactor,
  query: TransactionQuery,
): Promise<void> {
  const { rows } =
    factor.type === 'totp'
      ? await query(
          '/* assertMfaFactorStillOwned:totp */ SELECT 1 FROM user_totp_authenticators WHERE id = $1 AND user_id = $2 AND verified_at IS NOT NULL',
          [factor.authenticatorId, currentUserId],
        )
      : await query(
          '/* assertMfaFactorStillOwned:passkey */ SELECT 1 FROM user_passkeys WHERE id = $1 AND user_id = $2',
          [factor.passkeyId, currentUserId],
        )
  if (rows.length !== 1)
    throw createHttpError(401, 'MFA method is no longer connected to this account')
}

async function readAdmittedMfaUser(
  attempt: LoginAttempt,
  factor: VerifiedMfaFactor,
  fetchUser: (userId: string, query: TransactionQuery) => Promise<PrivateUser | null>,
  query: TransactionQuery,
) {
  await lockLoginCredentialAdmission(attempt.userId, attempt.firstFactor, query)
  await assertMfaFactorStillOwned(attempt.userId, factor, query)
  return fetchUser(attempt.userId, query)
}

async function mintVerifiedMfaSession(
  user: PrivateUser,
  attempt: LoginAttempt,
  factor: VerifiedMfaFactor,
  deviceContext: DeviceContext | undefined,
  query: TransactionQuery,
) {
  const claims = await getEnrichedSessionClaims(user, { mfaVerifiedAt: factor.verifiedAt })
  return createDeviceAndSessionTokens({
    did: attempt.deviceId,
    uid: user.id,
    roles: claims.roles,
    mfaVerifiedAt: factor.verifiedAt,
    membershipPlan: claims.membershipPlan,
    membershipExpiresAt: claims.membershipExpiresAt,
    trustTier: claims.trustTier,
    uiLocale: claims.uiLocale,
    deviceClass: attempt.deviceClass,
    deviceContext,
    authOrigin: attempt.authOrigin,
    query,
  })
}
