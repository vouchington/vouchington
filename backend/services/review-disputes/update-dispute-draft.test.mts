import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestTopic,
  insertTestPost,
  insertTestPostReview,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { createTopicClaim } from '@services/topic-claims/create'
import { adminVerifyTopicClaim } from '@services/topic-claims/admin-verify'
import { parseCreateReviewDisputeInput } from './parse.mts'
import { createReviewDispute } from './create.mts'
import { updateReviewDisputeDraft } from './update-dispute-draft.mts'
import { getReviewDisputeById } from './get.mts'
import { approveReviewDispute } from './approve-dispute.mts'

async function makeDisputeFixture(staffId: string) {
  const creator = await createTestUser()
  const claimant = await createTestUser()
  const topicId = await insertTestTopic({
    name: `Update Draft Topic ${crypto.randomUUID().slice(0, 8)}`,
    slug: `update-draft-topic-${crypto.randomUUID().slice(0, 8)}`,
    createdById: creator.id,
  })
  const { claim } = await createTopicClaim(claimant.id, {
    topicId,
    claimedRole: 'Issuer',
    evidence: '',
  })
  await adminVerifyTopicClaim(staffId, claim.id)
  const reviewer = await createTestUser()
  const postId = await insertTestPost({
    title: `Update Draft Review ${crypto.randomUUID().slice(0, 8)}`,
    slug: `update-draft-review-${crypto.randomUUID().slice(0, 8)}`,
    createdById: reviewer.id,
    markdown: 'Review for draft update test.',
    postType: 'review',
  })
  await insertTestPostReview(postId, topicId, 3)
  const input = parseCreateReviewDisputeInput({
    post_id: postId,
    reason: 'factually_inaccurate',
    claim_text: `Update draft test ${crypto.randomUUID()}`,
  })
  const { dispute } = await createReviewDispute(claimant, input)
  return { dispute, postId }
}

describe('updateReviewDisputeDraft', () => {
  let staff: PrivateUser

  beforeAll(async () => {
    staff = await createTestUser()
  })

  it('returns 422 when neither field is provided', async () => {
    await expect(updateReviewDisputeDraft(staff.id, crypto.randomUUID(), {})).rejects.toMatchObject(
      { status: 422 },
    )
  })

  it('updates public_response and clears approval', async () => {
    const { dispute } = await makeDisputeFixture(staff.id)

    // First set a public response and approve it
    await updateReviewDisputeDraft(staff.id, dispute.id, {
      publicResponse: 'Initial response',
    })
    await approveReviewDispute(staff.id, dispute.id)

    // Verify it is approved
    const approved = await getReviewDisputeById(dispute.id)
    expect(approved!.approved_at).not.toBeNull()

    // Now edit the draft — should reset approval
    const updated = await updateReviewDisputeDraft(staff.id, dispute.id, {
      publicResponse: 'Edited response',
    })

    expect(updated.public_response).toBe('Edited response')
    expect(updated.approved_at).toBeNull()
    expect(updated.approved_by_id).toBeNull()
    expect(updated.edited_by_id).toBe(staff.id)
    expect(updated.edited_at).not.toBeNull()
  })

  it('updates internal_notes only', async () => {
    const { dispute } = await makeDisputeFixture(staff.id)
    const updated = await updateReviewDisputeDraft(staff.id, dispute.id, {
      internalNotes: 'Private note for staff.',
    })
    expect(updated.internal_notes).toBe('Private note for staff.')
  })

  it('returns 404 when dispute does not exist (WHERE sent_at IS NULL guard)', async () => {
    await expect(
      updateReviewDisputeDraft(staff.id, crypto.randomUUID(), {
        publicResponse: 'x',
      }),
    ).rejects.toMatchObject({ status: 404 })
  })
})
