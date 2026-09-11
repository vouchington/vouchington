import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestTopic,
  insertTestPost,
  insertTestPostReview,
  updateTestPostReviewRating,
  deleteTestPostReviewRating,
  updateTestReviewDisputeSubject,
  softDeleteUser,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { createTopicClaim } from '@services/topic-claims/create'
import { adminVerifyTopicClaim } from '@services/topic-claims/admin-verify'
import { parseCreateReviewDisputeInput } from './parse.mts'
import { createReviewDispute } from './create.mts'
import { getReviewDisputeById, listReviewDisputes, listDisputesForPost } from './get.mts'
import { dismissReviewDispute } from './resolve.mts'

async function makeDisputeFixture(staffId: string, suffix = '') {
  const creator = await createTestUser()
  const claimant = await createTestUser()
  const topicId = await insertTestTopic({
    name: `Get SVC Topic ${suffix || crypto.randomUUID().slice(0, 8)}`,
    slug: `get-svc-topic-${suffix || crypto.randomUUID().slice(0, 8)}`,
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
    title: `Get SVC Review ${crypto.randomUUID().slice(0, 8)}`,
    slug: `get-svc-review-${crypto.randomUUID().slice(0, 8)}`,
    createdById: reviewer.id,
    markdown: 'Review for get service test.',
    postType: 'review',
  })
  await insertTestPostReview(postId, topicId, 2)
  const input = parseCreateReviewDisputeInput({
    post_id: postId,
    reason: 'other',
    claim_text: `Get svc test ${crypto.randomUUID()}`,
  })
  const { dispute } = await createReviewDispute(claimant, input)
  return { dispute, postId, topicId, claimant }
}

describe('getReviewDisputeById', () => {
  let staff: PrivateUser

  beforeAll(async () => {
    staff = await createTestUser()
  })

  it('returns a dispute by id', async () => {
    const { dispute } = await makeDisputeFixture(staff.id)
    const found = await getReviewDisputeById(dispute.id)
    expect(found).not.toBeNull()
    expect(found!.id).toBe(dispute.id)
    expect(found!.status).toBe('pending')
  })

  it('returns null for unknown id', async () => {
    const result = await getReviewDisputeById(crypto.randomUUID())
    expect(result).toBeNull()
  })

  it('keeps a dispute readable with durable actor fallback after disputant deletion', async () => {
    const { dispute, claimant } = await makeDisputeFixture(staff.id)
    await softDeleteUser(claimant.id)

    const found = await getReviewDisputeById(dispute.id)
    expect(found).not.toBeNull()
    expect(found!.staff_context?.disputant).toEqual({
      id: claimant.id,
      username: null,
      verified_display_name: null,
      profile_image_id: null,
    })
  })

  it('preserves the disputed rating after the live review rating changes and is deleted', async () => {
    const { dispute, postId, topicId } = await makeDisputeFixture(staff.id)

    await updateTestPostReviewRating(postId, topicId, 5)
    const afterUpdate = await getReviewDisputeById(dispute.id)
    expect(afterUpdate?.staff_context?.review.rating).toBe(2)

    await deleteTestPostReviewRating(postId, topicId)
    const afterDelete = await getReviewDisputeById(dispute.id)
    expect(afterDelete?.staff_context?.review.rating).toBe(2)
  })

  it('rejects direct mutation of every immutable dispute subject field', async () => {
    const { dispute } = await makeDisputeFixture(staff.id)
    const otherUser = await createTestUser()
    const otherTopicId = await insertTestTopic({
      name: `Immutable Dispute Topic ${crypto.randomUUID().slice(0, 8)}`,
      slug: `immutable-dispute-topic-${crypto.randomUUID().slice(0, 8)}`,
      createdById: otherUser.id,
    })
    const otherPostId = await insertTestPost({
      title: `Immutable Dispute Post ${crypto.randomUUID().slice(0, 8)}`,
      slug: `immutable-dispute-post-${crypto.randomUUID().slice(0, 8)}`,
      createdById: otherUser.id,
      markdown: 'Alternate post.',
      postType: 'review',
    })

    await expect(
      updateTestReviewDisputeSubject({ disputeId: dispute.id, postId: otherPostId }),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      updateTestReviewDisputeSubject({ disputeId: dispute.id, topicId: otherTopicId }),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      updateTestReviewDisputeSubject({ disputeId: dispute.id, disputedRating: 5 }),
    ).rejects.toMatchObject({ code: '23514' })
  })
})

describe('listReviewDisputes', () => {
  let staff: PrivateUser

  beforeAll(async () => {
    staff = await createTestUser()
  })

  it('returns pending disputes by default', async () => {
    const { dispute } = await makeDisputeFixture(staff.id)
    const { disputes } = await listReviewDisputes({ status: 'pending' })
    const found = disputes.find(d => d.id === dispute.id)
    expect(found).toBeDefined()
    expect(found!.status).toBe('pending')
  })

  it('filters by status dismissed', async () => {
    const { dispute } = await makeDisputeFixture(staff.id)
    await dismissReviewDispute(staff.id, dispute.id)
    const { disputes } = await listReviewDisputes({ status: 'dismissed' })
    const found = disputes.find(d => d.id === dispute.id)
    expect(found).toBeDefined()
    expect(found!.status).toBe('dismissed')
  })

  it('filters by disputantUserId', async () => {
    const { dispute, claimant } = await makeDisputeFixture(staff.id)
    const { disputes } = await listReviewDisputes({
      status: 'pending',
      disputantUserId: claimant.id,
    })
    for (const d of disputes) {
      expect(d.disputant_user_id).toBe(claimant.id)
    }
    expect(disputes.find(d => d.id === dispute.id)).toBeDefined()
  })

  it('respects limit and returns hasNextPage=true when more exist', async () => {
    // Create two disputes to test pagination
    await makeDisputeFixture(staff.id)
    await makeDisputeFixture(staff.id)

    const { disputes, hasNextPage } = await listReviewDisputes({ status: 'pending', limit: 1 })
    expect(disputes.length).toBe(1)
    // With many pending disputes hasNextPage should be true
    expect(hasNextPage).toBe(true)
  })

  it('beforeId cursor excludes IDs >= cursor', async () => {
    const { dispute: older } = await makeDisputeFixture(staff.id)
    const { dispute: newer } = await makeDisputeFixture(staff.id)
    const { disputes: paged } = await listReviewDisputes({
      status: 'pending',
      beforeId: newer.id,
      limit: 100,
    })
    // uuidv7 ids sort ascending by creation time; beforeId keeps only id < cursor.
    expect(paged.every(d => d.id.localeCompare(newer.id) < 0)).toBe(true)
    expect(paged.some(d => d.id === newer.id)).toBe(false)
    expect(paged.some(d => d.id === older.id)).toBe(true)
  })
})

describe('listDisputesForPost', () => {
  let staff: PrivateUser

  beforeAll(async () => {
    staff = await createTestUser()
  })

  it('returns disputes for a given post', async () => {
    const { dispute, postId } = await makeDisputeFixture(staff.id)
    const disputes = await listDisputesForPost(postId)
    expect(disputes.length).toBeGreaterThan(0)
    expect(disputes.find(d => d.id === dispute.id)).toBeDefined()
  })

  it('returns empty array for post with no disputes', async () => {
    const creator = await createTestUser()
    const postId = await insertTestPost({
      title: `No Dispute Post ${crypto.randomUUID().slice(0, 8)}`,
      slug: `no-dispute-post-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
      markdown: 'No disputes here.',
    })
    const disputes = await listDisputesForPost(postId)
    expect(disputes).toEqual([])
  })
})
