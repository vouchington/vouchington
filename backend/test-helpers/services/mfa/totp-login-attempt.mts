import { v7 } from 'uuid'
import { createTestUser } from '../../entities/users.mts'
import { insertTestTotpAuthenticator } from '../../entities/totp.mts'
import { createLoginAttempt } from '../../../services/mfa/login-attempt.mts'
import type { PrivateUser } from '../../../services/users/types.mts'
import type { DeviceClass } from '../../../../ts-shared/session-jwt/index.mts'

// Creates a TOTP-enrolled user and a live login attempt for them, the shared precondition behind
// every TOTP MFA-verification test scenario (schema validation, wrong-code rejection, attempt
// limiting, suspension, success). `labelSuffix` becomes part of the authenticator's name so
// failures are traceable to the scenario that created it.
export async function createTotpMfaLoginAttempt(
  labelSuffix: string,
  loginAttemptOverrides: { deviceClass?: DeviceClass } = {},
): Promise<{ mfaUser: PrivateUser; attemptId: string }> {
  const mfaUser = await createTestUser()
  const suffix = `mfa-totp-${labelSuffix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  await insertTestTotpAuthenticator(mfaUser.id, suffix)
  const attemptId = await createLoginAttempt({
    userId: mfaUser.id,
    deviceId: v7(),
    sessionId: v7(),
    ...loginAttemptOverrides,
  })
  return { mfaUser, attemptId }
}
