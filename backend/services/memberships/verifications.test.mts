import { completeMembershipVerification } from '@voucha/test-helpers/data-stores/psql/membership-verifications'
import { getMembershipPendingState } from './membership-overview-pending.mts'
import { describe, expect, it } from 'vitest'
import { createTestPendingMembershipVerification, createTestUser } from '@voucha/test-helpers'
import {
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

  it('pages pending domain rows and preserves overview status without a queue timestamp', async () => {
    const user = await createTestUser()
    const first = await createTestPendingMembershipVerification(user.id)
    const second = await createTestPendingMembershipVerification(user.id)
    await expect(
      findRecoverableMembershipVerificationIds({ after: first, through: second, limit: 1 }),
    ).resolves.toEqual([second])
    await expect(getMembershipPendingState(user.id)).resolves.toMatchObject({
      verifications: expect.arrayContaining([
        expect.objectContaining({ id: first, status: 'pending', next_processing_at: null }),
      ]),
    })
    await completeMembershipVerification(first)
    await expect(
      findRecoverableMembershipVerificationIds({ after: first, through: second, limit: 1 }),
    ).resolves.toEqual([second])
    await expect(getMembershipPendingState(user.id)).resolves.toMatchObject({
      verifications: expect.arrayContaining([
        expect.objectContaining({ id: first, status: 'verified', next_processing_at: null }),
      ]),
    })
  })
})
