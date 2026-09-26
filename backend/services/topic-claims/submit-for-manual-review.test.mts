import { describe, it, expect, beforeAll } from 'vitest'
import { createTestUser, insertTestTopic } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { createTopicClaim } from './create.mts'
import { adminVerifyTopicClaim } from './admin-verify.mts'
import { submitTopicClaimForManualReview } from './submit-for-manual-review.mts'

describe('submitTopicClaimForManualReview', () => {
  let claimant: PrivateUser
  let staff: PrivateUser
  let topicId: string

  beforeAll(async () => {
    claimant = await createTestUser()
    staff = await createTestUser()
    const creator = await createTestUser()
    topicId = await insertTestTopic({
      name: `Submit Manual Topic ${crypto.randomUUID().slice(0, 8)}`,
      slug: `submit-manual-topic-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })
  })

  it('submits a claim for manual review when evidence is provided', async () => {
    const { claim } = await createTopicClaim(claimant.id, {
      topicId,
      claimedRole: 'Issuer',
      evidence: '',
    })

    const updated = await submitTopicClaimForManualReview(
      claimant.id,
      claim.id,
      'Business registration doc attached.',
    )

    expect(updated.submitted_at).not.toBeNull()
    expect(updated.evidence).toBe('Business registration doc attached.')
    expect(updated).not.toHaveProperty('verification_token_hash')
  })

  it('throws 422 when evidence is empty string', async () => {
    const { claim } = await createTopicClaim(claimant.id, {
      topicId,
      claimedRole: 'Operator',
      evidence: '',
    })
    await expect(submitTopicClaimForManualReview(claimant.id, claim.id, '')).rejects.toMatchObject({
      status: 422,
    })
  })

  it('throws 422 when evidence is whitespace only', async () => {
    const { claim } = await createTopicClaim(claimant.id, {
      topicId,
      claimedRole: 'Operator',
      evidence: '',
    })
    await expect(
      submitTopicClaimForManualReview(claimant.id, claim.id, '   '),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('throws 404 when claim does not belong to user', async () => {
    const other = await createTestUser()
    const { claim } = await createTopicClaim(claimant.id, {
      topicId,
      claimedRole: 'Issuer',
      evidence: '',
    })
    await expect(
      submitTopicClaimForManualReview(other.id, claim.id, 'Evidence from wrong user.'),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('throws 404 when claim id does not exist', async () => {
    await expect(
      submitTopicClaimForManualReview(claimant.id, crypto.randomUUID(), 'Evidence.'),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('throws 404 when claim is already verified', async () => {
    const creator = await createTestUser()
    const tid = await insertTestTopic({
      name: `Submit Verified Topic ${crypto.randomUUID().slice(0, 8)}`,
      slug: `submit-verified-topic-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })
    const { claim } = await createTopicClaim(claimant.id, {
      topicId: tid,
      claimedRole: 'Issuer',
      evidence: '',
    })
    await adminVerifyTopicClaim(staff.id, claim.id)

    await expect(
      submitTopicClaimForManualReview(claimant.id, claim.id, 'Post-verification evidence.'),
    ).rejects.toMatchObject({ status: 404 })
  })
})
