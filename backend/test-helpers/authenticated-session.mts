import { v7 } from 'uuid'
import {
  createDeviceAndSessionTokens,
  getEnrichedSessionClaims,
  type DeviceContext,
} from '../services/jwt-session/index.mts'
import type { PrivateUser } from '@voucha/types/entities/user'
import {
  clearMfaLoginAttempts,
  completeMfaLoginWithContext,
  createLoginAttempt,
  getAndDeleteLoginAttempt,
} from '../services/mfa/index.mts'
import { verifyTotpCode } from '../services/totp/index.mts'
import { getPrivateUserByAny } from '../services/users/get.mts'
import { generateTestTotpCode, insertTestTotpAuthenticator } from './entities/totp.mts'
import * as OTPAuth from 'otpauth'

/** Ordinary authenticated fixtures have no MFA assurance. */
export async function createAuthenticatedTestSession(user: PrivateUser) {
  const did = v7()
  const claims = await getEnrichedSessionClaims(user)
  return createDeviceAndSessionTokens({ did, uid: user.id, ...claims })
}

export async function hasCurrentAdministratorRole(userId: string): Promise<boolean> {
  const user = await getPrivateUserByAny(userId, { readOnly: false })
  return user?.roles.includes('administrator') ?? false
}

/** Complete a real TOTP factor challenge before minting an MFA-assured test session. */
export async function createVerifiedMfaTestSession(userId: string, deviceContext?: DeviceContext) {
  const user = await getPrivateUserByAny(userId, { readOnly: false })
  if (!user?.email_address) throw new Error('MFA fixture requires a user with a primary email')

  // A unique secret prevents parallel fixtures for one seeded user from consuming each other's
  // TOTP time step. Keep the enrolled factor: completion checks that it is still owned.
  const secret = new OTPAuth.Secret({ size: 20 }).base32
  await insertTestTotpAuthenticator(userId, `mfa-session-${v7()}`, undefined, secret)
  const attemptId = await createLoginAttempt({
    userId,
    firstFactor: { type: 'email', emailAddress: user.email_address },
    deviceId: v7(),
    sessionId: v7(),
    authOrigin: 'web',
  })
  const verified = await verifyTotpCode(userId, generateTestTotpCode(secret))
  if (!verified) throw new Error('MFA fixture TOTP verification failed')
  const attempt = await getAndDeleteLoginAttempt(attemptId)
  if (!attempt) throw new Error('MFA fixture login attempt expired')
  await clearMfaLoginAttempts(attemptId, attempt)
  return completeMfaLoginWithContext(
    attempt,
    (id, query) => getPrivateUserByAny(id, { query }),
    {
      type: 'totp',
      authenticatorId: verified.authenticatorId,
      verifiedAt: Math.floor(Date.now() / 1000),
    },
    deviceContext,
  )
}
