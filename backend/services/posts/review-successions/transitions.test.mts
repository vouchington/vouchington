import {
  createRandomString,
  createTestUser,
  deleteTestPost,
  deleteTestPostReviewRating,
  getPostArchivedFields,
  insertTestPost,
  insertTestPostReview,
  insertTestTopic,
} from '@voucha/test-helpers'
import { beforeAll, describe, expect, it } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import { reconcileReviewSuccessionsForPostIds } from './reconcile.mts'

describe('review succession lifecycle transitions', () => {
  let author: PrivateUser
  let administrator: PrivateUser
  let topicA: string
  let topicB: string

  beforeAll(async () => {
    ;[author, administrator] = await Promise.all([
      createTestUser(),
      createTestUser({ administrator: true }),
    ])
    ;[topicA, topicB] = await Promise.all(
      ['a', 'b'].map(label =>
        insertTestTopic({
          name: `Review succession transition ${label} ${createRandomString(8)}`,
          slug: `review-succession-transition-${label}-${createRandomString(8)}`,
          createdById: administrator.id,
        }),
      ),
    )
  })

  it('restores the automatic predecessor when its successor is soft-deleted', async () => {
    const predecessor = await createReview([topicA])
    const successor = await createReview([topicA])
    await reconcileReviewSuccessionsForPostIds([successor])

    await deleteTestPost(successor)
    await expect(reconcileReviewSuccessionsForPostIds([successor])).resolves.toEqual({
      changedPostIds: [predecessor],
    })

    expect((await getPostArchivedFields(predecessor))?.archived_at).toBeNull()
  })

  it('routes a topic-set edit through both its current and historical groups', async () => {
    const predecessor = await createReview([topicA])
    const successor = await createReview([topicA])
    await reconcileReviewSuccessionsForPostIds([successor])

    await Promise.all([
      deleteTestPostReviewRating(successor, topicA),
      insertTestPostReview(successor, topicB),
    ])
    await expect(reconcileReviewSuccessionsForPostIds([successor])).resolves.toEqual({
      changedPostIds: [predecessor],
    })

    expect((await getPostArchivedFields(predecessor))?.archived_at).toBeNull()
  })

  it('serializes racing eligible successors and converges on the newest review', async () => {
    const predecessor = await createReview([topicB])
    const firstSuccessor = await createReview([topicB])
    const newestSuccessor = await createReview([topicB])

    await Promise.all([
      reconcileReviewSuccessionsForPostIds([firstSuccessor]),
      reconcileReviewSuccessionsForPostIds([newestSuccessor]),
    ])

    expect((await getPostArchivedFields(predecessor))?.archived_at).not.toBeNull()
    expect((await getPostArchivedFields(firstSuccessor))?.archived_at).not.toBeNull()
    expect((await getPostArchivedFields(newestSuccessor))?.archived_at).toBeNull()
  })

  async function createReview(topicIds: readonly string[]): Promise<string> {
    const suffix = createRandomString(10)
    const postId = await insertTestPost({
      title: `Review succession transition ${suffix}`,
      slug: `review-succession-transition-${suffix}`,
      createdById: author.id,
      markdown: 'Review succession lifecycle transition fixture.',
      postType: 'review',
      clearanceStatus: 'approved',
    })
    await Promise.all(topicIds.map(topicId => insertTestPostReview(postId, topicId)))
    return postId
  }
})
