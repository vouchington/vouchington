import { describe, it, expect, beforeAll } from 'vitest'
import { createTestUser, insertTestTopic } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { createTopicClaim } from './create.mts'
import { adminVerifyTopicClaim, rejectTopicClaim } from './admin-verify.mts'
import { revokeTopicClaim } from './revoke.mts'
import { currentUserCanDisputeReviewsOfTopic } from './authorization.mts'

describe('currentUserCanDisputeReviewsOfTopic', () => {
  let staff: PrivateUser
  let claimant: PrivateUser
  let topicId: string

  beforeAll(async () => {
    staff = await createTestUser()
    claimant = await createTestUser()
    const creator = await createTestUser()
    topicId = await insertTestTopic({
      name: `Auth Topic ${crypto.randomUUID().slice(0, 8)}`,
      slug: `auth-topic-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })
  })

  it('returns false when user has no claim', async () => {
    const other = await createTestUser()
    const result = await currentUserCanDisputeReviewsOfTopic(other, topicId)
    expect(result).toBe(false)
  })

  it('returns false when claim is pending (not verified)', async () => {
    const user = await createTestUser()
    const creator = await createTestUser()
    const tid = await insertTestTopic({
      name: `Auth Pending ${crypto.randomUUID().slice(0, 8)}`,
      slug: `auth-pending-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })
    await createTopicClaim(user.id, { topicId: tid, claimedRole: 'Issuer', evidence: '' })

    const result = await currentUserCanDisputeReviewsOfTopic(user, tid)
    expect(result).toBe(false)
  })

  it('returns true when claim is verified', async () => {
    const { claim } = await createTopicClaim(claimant.id, {
      topicId,
      claimedRole: 'Issuer',
      evidence: '',
    })
    await adminVerifyTopicClaim(staff.id, claim.id)

    const result = await currentUserCanDisputeReviewsOfTopic(claimant, topicId)
    expect(result).toBe(true)
  })

  it('returns false after a verified claim is revoked', async () => {
    const user = await createTestUser()
    const creator = await createTestUser()
    const tid = await insertTestTopic({
      name: `Auth Revoked ${crypto.randomUUID().slice(0, 8)}`,
      slug: `auth-revoked-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })
    const { claim } = await createTopicClaim(user.id, {
      topicId: tid,
      claimedRole: 'Issuer',
      evidence: '',
    })
    await adminVerifyTopicClaim(staff.id, claim.id)
    await revokeTopicClaim(staff.id, claim.id, 'Changed ownership')

    const result = await currentUserCanDisputeReviewsOfTopic(user, tid)
    expect(result).toBe(false)
  })

  it('returns false after a claim is rejected', async () => {
    const user = await createTestUser()
    const creator = await createTestUser()
    const tid = await insertTestTopic({
      name: `Auth Rejected ${crypto.randomUUID().slice(0, 8)}`,
      slug: `auth-rej-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })
    const { claim } = await createTopicClaim(user.id, {
      topicId: tid,
      claimedRole: 'Issuer',
      evidence: '',
    })
    await rejectTopicClaim(staff.id, claim.id, 'Not verified')

    const result = await currentUserCanDisputeReviewsOfTopic(user, tid)
    expect(result).toBe(false)
  })
})
