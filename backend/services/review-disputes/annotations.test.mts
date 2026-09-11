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
import { resolveReviewDisputeAnnotate } from './resolve.mts'
import {
  getActiveAnnotationForPost,
  getActiveAnnotationsForPosts,
  removeReviewDisputeAnnotation,
} from './annotations.mts'

async function makeAnnotatedPost(staffId: string) {
  const creator = await createTestUser()
  const claimant = await createTestUser()
  const topicId = await insertTestTopic({
    name: `Ann SVC Topic ${crypto.randomUUID().slice(0, 8)}`,
    slug: `ann-svc-topic-${crypto.randomUUID().slice(0, 8)}`,
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
    title: `Ann SVC Review ${crypto.randomUUID().slice(0, 8)}`,
    slug: `ann-svc-review-${crypto.randomUUID().slice(0, 8)}`,
    createdById: reviewer.id,
    markdown: 'Review for annotation service test.',
    postType: 'review',
  })
  await insertTestPostReview(postId, topicId, 2)
  const input = parseCreateReviewDisputeInput({
    post_id: postId,
    reason: 'factually_inaccurate',
    claim_text: `Ann svc test ${crypto.randomUUID()}`,
  })
  const { dispute } = await createReviewDispute(claimant, input)
  await resolveReviewDisputeAnnotate(staffId, dispute.id, 'Service annotation body.')
  return { postId, disputeId: dispute.id }
}

describe('getActiveAnnotationForPost', () => {
  let staff: PrivateUser

  beforeAll(async () => {
    staff = await createTestUser()
  })

  it('returns the active annotation for a post', async () => {
    const { postId } = await makeAnnotatedPost(staff.id)
    const annotation = await getActiveAnnotationForPost(postId)
    expect(annotation).not.toBeNull()
    expect(annotation!.post_id).toBe(postId)
    expect(annotation!.body_text).toBe('Service annotation body.')
  })

  it('returns null when no annotation exists', async () => {
    const creator = await createTestUser()
    const postId = await insertTestPost({
      title: `No Ann Post ${crypto.randomUUID().slice(0, 8)}`,
      slug: `no-ann-post-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
      markdown: 'No annotation here.',
    })
    const result = await getActiveAnnotationForPost(postId)
    expect(result).toBeNull()
  })
})

describe('getActiveAnnotationsForPosts', () => {
  let staff: PrivateUser

  beforeAll(async () => {
    staff = await createTestUser()
  })

  it('returns empty array for empty input', async () => {
    const result = await getActiveAnnotationsForPosts([])
    expect(result).toEqual([])
  })

  it('returns annotations for matching post IDs only', async () => {
    const { postId } = await makeAnnotatedPost(staff.id)
    const unknownId = crypto.randomUUID()

    const results = await getActiveAnnotationsForPosts([postId, unknownId])
    expect(results.length).toBe(1)
    expect(results[0].post_id).toBe(postId)
  })

  it('returns multiple annotations for multiple annotated posts', async () => {
    const { postId: postId1 } = await makeAnnotatedPost(staff.id)
    const { postId: postId2 } = await makeAnnotatedPost(staff.id)

    const results = await getActiveAnnotationsForPosts([postId1, postId2])
    expect(results.length).toBe(2)
    const postIds = results.map(a => a.post_id)
    expect(postIds).toContain(postId1)
    expect(postIds).toContain(postId2)
  })
})

describe('removeReviewDisputeAnnotation', () => {
  let staff: PrivateUser

  beforeAll(async () => {
    staff = await createTestUser()
  })

  it('removes an existing annotation', async () => {
    const { postId } = await makeAnnotatedPost(staff.id)
    const annotation = await getActiveAnnotationForPost(postId)
    expect(annotation).not.toBeNull()

    const removed = await removeReviewDisputeAnnotation(staff.id, annotation!.id)
    expect(removed.removed_at).not.toBeNull()
    expect(removed.removed_by_id).toBe(staff.id)

    // Should no longer be active
    const after = await getActiveAnnotationForPost(postId)
    expect(after).toBeNull()
  })

  it('returns 404 when annotation does not exist', async () => {
    await expect(
      removeReviewDisputeAnnotation(staff.id, crypto.randomUUID()),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('returns 404 when annotation is already removed', async () => {
    const { postId } = await makeAnnotatedPost(staff.id)
    const annotation = await getActiveAnnotationForPost(postId)
    await removeReviewDisputeAnnotation(staff.id, annotation!.id)

    await expect(removeReviewDisputeAnnotation(staff.id, annotation!.id)).rejects.toMatchObject({
      status: 404,
    })
  })
})
