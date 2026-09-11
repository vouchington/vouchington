import { describe, expect, it } from 'vitest'
import {
  createTestPendingMembershipVerification,
  createTestUser,
  getTestMembershipVerificationProcessingState,
} from '@voucha/test-helpers'
import {
  deferMembershipVerificationUntilAdapterAvailable,
  findRecoverableMembershipVerificationIds,
  createMembershipVerificationFingerprint,
  getMembershipVerificationStatus,
} from './verifications.mts'

describe('membership verifications', () => {
  it('fingerprints evidence independently of object key order', () => {
    expect(createMembershipVerificationFingerprint('google_play', 'intent-a', { b: 2, a: 1 })).toBe(
      createMembershipVerificationFingerprint('google_play', 'intent-a', { a: 1, b: 2 }),
    )
  })

  it('derives the public status from lifecycle timestamps', () => {
    expect(
      getMembershipVerificationStatus({
        verified_at: null,
        conflicted_at: new Date(),
        rejected_at: null,
      }),
    ).toBe('conflict')
  })

  it('leases and defers due durable verification work without leaving a stale claim', async () => {
    const user = await createTestUser()
    const verificationId = await createTestPendingMembershipVerification(user.id)

    await expect(deferMembershipVerificationUntilAdapterAvailable(verificationId)).resolves.toBe(
      true,
    )
    const state = await getTestMembershipVerificationProcessingState(verificationId)

    expect(state).toMatchObject({
      processing_claim_token: null,
      processing_claimed_at: null,
      processing_attempts: 1,
      last_error: 'provider_adapter_unavailable',
    })
    expect(state?.next_processing_at?.getTime()).toBeGreaterThan(Date.now())
    await expect(findRecoverableMembershipVerificationIds()).resolves.not.toContain(verificationId)
  })
})
