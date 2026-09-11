import { beforeAll, describe, expect, it } from 'vitest'
import {
  createRandomString,
  createTestUser,
  getPostArchivedFields,
  insertTestPost,
  insertTestPostReview,
  insertTestTopic,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { REVIEW_SUCCESSION_CANDIDATE_PAGE_SIZE } from './candidates.mts'
import { listReviewSuccessionsForPostIds, reconcileReviewSuccessionsForPostIds } from './index.mts'

describe('review succession exact-topic routing', () => {
  let administrator: PrivateUser
  let author: PrivateUser
  let otherAuthor: PrivateUser
  let topicA: string
  let topicB: string
  let topicC: string
  let topicD: string

  beforeAll(async () => {
    ;[administrator, author, otherAuthor] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
      createTestUser(),
    ])
    ;[topicA, topicB, topicC, topicD] = await Promise.all([
      insertTestTopic({
        name: `Exact review topic A ${createRandomString(8)}`,
        slug: `exact-review-a-${createRandomString(8)}`,
        createdById: administrator.id,
      }),
      insertTestTopic({
        name: `Exact review topic B ${createRandomString(8)}`,
        slug: `exact-review-b-${createRandomString(8)}`,
        createdById: administrator.id,
      }),
      insertTestTopic({
        name: `Exact review topic C ${createRandomString(8)}`,
        slug: `exact-review-c-${createRandomString(8)}`,
        createdById: administrator.id,
      }),
      insertTestTopic({
        name: `Exact review topic D ${createRandomString(8)}`,
        slug: `exact-review-d-${createRandomString(8)}`,
        createdById: administrator.id,
      }),
    ])
  })

  it('excludes subset, superset, different-author, and empty-topic reviews', async () => {
    const predecessorId = await createReview([topicA])
    const supersetId = await createReview([topicA, topicB])
    const otherAuthorId = await createReview([topicA], otherAuthor.id)
    const emptyTopicId = await createReview([])

    await expect(
      reconcileReviewSuccessionsForPostIds([supersetId, otherAuthorId, emptyTopicId]),
    ).resolves.toEqual({ changedPostIds: [] })
    expect((await getPostArchivedFields(predecessorId))?.archived_at).toBeNull()

    const exactSuccessorId = await createReview([topicA])
    await expect(reconcileReviewSuccessionsForPostIds([exactSuccessorId])).resolves.toEqual({
      changedPostIds: [predecessorId],
    })
    await expect(listReviewSuccessionsForPostIds([predecessorId])).resolves.toMatchObject([
      { predecessor_post_id: predecessorId, successor_post_id: exactSuccessorId },
    ])
    expect((await getPostArchivedFields(otherAuthorId))?.archived_at).toBeNull()
  })

  it('archives all older exact-set predecessors in one reconciliation', async () => {
    const firstId = await createReview([topicB])
    const secondId = await createReview([topicB])
    const successorId = await createReview([topicB])

    await expect(reconcileReviewSuccessionsForPostIds([successorId])).resolves.toEqual({
      changedPostIds: [firstId, secondId].toSorted(),
    })
    await expect(listReviewSuccessionsForPostIds([firstId, secondId])).resolves.toMatchObject([
      { predecessor_post_id: firstId, successor_post_id: successorId },
      { predecessor_post_id: secondId, successor_post_id: successorId },
    ])
  })

  it('uses active history for an edited successor and current routing for its new topic set', async () => {
    const predecessorId = await createReview([topicC])
    const editedSuccessorId = await createReview([topicC])

    await reconcileReviewSuccessionsForPostIds([editedSuccessorId])
    await insertTestPostReview(editedSuccessorId, topicD)
    await expect(reconcileReviewSuccessionsForPostIds([editedSuccessorId])).resolves.toEqual({
      changedPostIds: [predecessorId],
    })
    expect((await getPostArchivedFields(predecessorId))?.archived_at).toBeNull()

    const replacementId = await createReview([topicC, topicD])
    await expect(reconcileReviewSuccessionsForPostIds([replacementId])).resolves.toEqual({
      changedPostIds: [editedSuccessorId],
    })
    expect((await getPostArchivedFields(predecessorId))?.archived_at).toBeNull()
    await expect(listReviewSuccessionsForPostIds([editedSuccessorId])).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          predecessor_post_id: editedSuccessorId,
          successor_post_id: replacementId,
        }),
      ]),
    )
  })

  it('converges prolific exact-topic groups through bounded candidate pages', async () => {
    const reviewIds = (
      await Promise.all(
        Array.from({ length: REVIEW_SUCCESSION_CANDIDATE_PAGE_SIZE + 2 }, () =>
          createReview([topicD]),
        ),
      )
    ).toSorted()
    const successorId = reviewIds.at(-1)!

    const first = await reconcileReviewSuccessionsForPostIds([successorId])
    expect(first.changedPostIds).toHaveLength(REVIEW_SUCCESSION_CANDIDATE_PAGE_SIZE - 1)

    await expect(reconcileReviewSuccessionsForPostIds([first.changedPostIds[0]!])).resolves.toEqual(
      { changedPostIds: reviewIds.slice(0, 2) },
    )
  }, 30_000)

  async function createReview(
    topicIds: readonly string[],
    createdById = author.id,
  ): Promise<string> {
    const suffix = createRandomString(10)
    const postId = await insertTestPost({
      title: `Exact review succession ${suffix}`,
      slug: `exact-review-succession-${suffix}`,
      createdById,
      markdown: 'Exact review succession test fixture.',
      postType: 'review',
    })
    await Promise.all(topicIds.map(topicId => insertTestPostReview(postId, topicId)))
    return postId
  }
})
