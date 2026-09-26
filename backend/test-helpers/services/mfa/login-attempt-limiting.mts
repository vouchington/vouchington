import { expect } from 'vitest'
import {
  recordFailedMfaLoginAttempt,
  type LoginAttempt,
} from '../../../services/mfa/login-attempt.mts'

// Records failed MFA attempts against `attemptId` until the shared per-attempt failure threshold
// (5 failures) trips the limiter on the 6th, asserting each intermediate call's return value along
// the way. Shared by every MFA verification test scenario that needs an already-limited attempt to
// prove a route still returns 429 (not 422/401) once the limiter has engaged.
export async function limitMfaLoginAttempt(
  attemptId: string,
  attempt: LoginAttempt,
): Promise<void> {
  for (const expectedLimited of [false, false, false, false, false, true]) {
    await expect(recordFailedMfaLoginAttempt(attemptId, attempt)).resolves.toBe(expectedLimited)
  }
}
