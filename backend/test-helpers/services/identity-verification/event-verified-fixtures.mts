import { onTestFinished, vi } from 'vitest'
import { v7 } from 'uuid'
import { createTestUser } from '../../entities/users.mts'
import { setUserVerificationFields } from '../../entities/identity-verification.mts'
import { invalidate } from '../../../services/entity-cache/invalidate.mts'
import { VOTE_AGGREGATION_USER_ELECTION_FAN_OUT_JOB } from '../../../queues/background/enqueues/vote-aggregation-jobs.mts'
import { backgroundQueue } from '../../shared-background-queue.mts'

export const USER_ELECTION_FAN_OUT_JOB_NAME = VOTE_AGGREGATION_USER_ELECTION_FAN_OUT_JOB.name

export type VerifiedResult = {
  documentNumber: string
  documentType: string
  firstName: string
  fullName: string
  issuingCountry: string
  lastName: string
  outcome: 'verified'
}

/** A Stripe-extracted result whose document number is unique, so no other test owns its hash. */
export function makeVerifiedResult(overrides: Partial<VerifiedResult> = {}): VerifiedResult {
  return {
    outcome: 'verified',
    firstName: 'Alice',
    lastName: 'Smith',
    fullName: 'Alice Smith',
    documentNumber: `X${v7()}`,
    issuingCountry: 'US',
    documentType: 'passport',
    ...overrides,
  }
}

/** The fingerprint HMAC reads this secret per call; restore the environment after the test. */
export function stubIdentityFingerprintSecret(): void {
  vi.stubEnv('IDENTITY_FINGERPRINT_SECRET', 'a'.repeat(32))
  onTestFinished(() => {
    vi.unstubAllEnvs()
  })
}

/** A user waiting on Stripe Identity for a session this test owns. */
export async function createIdentityPendingUser() {
  const user = await createTestUser()
  const sessionId = `vs_${v7()}`
  const checkoutSessionId = `cs_${v7()}`
  await setUserVerificationFields(user.id, {
    verificationStatus: 'identity_pending',
    pendingVerificationSessionId: sessionId,
    pendingCheckoutSessionId: checkoutSessionId,
  })
  return { user, sessionId, checkoutSessionId }
}

/** Observe, through the real function, which user caches an event handler invalidated. */
export function observeUserCacheInvalidations() {
  const spy = vi.spyOn(invalidate, 'users')
  onTestFinished(() => {
    spy.mockRestore()
  })
  return {
    spy,
    forUser: (userId: string) => spy.mock.calls.filter(([id]) => id === userId),
  }
}

/** Observe the user-election fan-out jobs admitted to the real background queue. */
export function observeUserElectionFanOuts() {
  const add = vi.spyOn(backgroundQueue, 'add')
  onTestFinished(() => {
    add.mockRestore()
  })
  return {
    forUser: (userId: string) =>
      add.mock.calls.flatMap(([name, data]) =>
        name === USER_ELECTION_FAN_OUT_JOB_NAME &&
        (data as { userId?: string } | undefined)?.userId === userId
          ? [data]
          : [],
      ),
  }
}
