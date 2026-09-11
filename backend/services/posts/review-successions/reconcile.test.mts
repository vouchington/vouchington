import { beforeAll, describe, expect, it } from 'vitest'
import {
  createRandomString,
  createTestUser,
  getPostArchivedFields,
  insertTestPost,
  insertTestPostReview,
  insertTestTopic,
  setTestPostClearanceStatus,
} from '@voucha/test-helpers'
import { archivePost, unarchivePost } from '../archive.mts'
import type { PrivateUser } from '@services/users/types'
import {
  listReviewSuccessionsForPostIds,
  reconcileReviewSuccessionsForPostIds,
  terminalizeActiveReviewSuccessionForManualPost,
} from './index.mts'

describe('review successions', () => {
  let author: PrivateUser
  let administrator: PrivateUser
  let topicA: string
  let topicB: string

  beforeAll(async () => {
    ;[author, administrator] = await Promise.all([
      createTestUser(),
      createTestUser({ administrator: true }),
    ])
    ;[topicA, topicB] = await Promise.all([
      insertTestTopic({
        name: `Review succession topic A ${createRandomString(8)}`,
        slug: `review-succession-a-${createRandomString(8)}`,
        createdById: administrator.id,
      }),
      insertTestTopic({
        name: `Review succession topic B ${createRandomString(8)}`,
        slug: `review-succession-b-${createRandomString(8)}`,
        createdById: administrator.id,
      }),
    ])
  })

  it('archives older publicly eligible reviews only after an exact-set successor is eligible', async () => {
    const predecessorId = await createReview([topicA, topicB])
    const successorId = await createReview([topicB, topicA], 'pending')

    await expect(reconcileReviewSuccessionsForPostIds([successorId])).resolves.toEqual({
      changedPostIds: [],
    })
    expect(await getPostArchivedFields(predecessorId)).toMatchObject({ archived_at: null })

    await setTestPostClearanceStatus(successorId, 'in_review', administrator.id)
    await expect(reconcileReviewSuccessionsForPostIds([successorId])).resolves.toEqual({
      changedPostIds: [],
    })
    await setTestPostClearanceStatus(successorId, 'rejected', administrator.id)
    await expect(reconcileReviewSuccessionsForPostIds([successorId])).resolves.toEqual({
      changedPostIds: [],
    })

    await setTestPostClearanceStatus(successorId, 'approved', administrator.id)
    await expect(reconcileReviewSuccessionsForPostIds([successorId])).resolves.toEqual({
      changedPostIds: [predecessorId],
    })
    expect(await getPostArchivedFields(predecessorId)).toMatchObject({
      archived_by_id: null,
    })
    expect((await getPostArchivedFields(predecessorId))?.archived_at).not.toBeNull()
    await expect(listReviewSuccessionsForPostIds([predecessorId])).resolves.toMatchObject([
      {
        predecessor_post_id: predecessorId,
        successor_post_id: successorId,
        author_user_id: author.id,
        topic_ids: [topicA, topicB].toSorted(),
        automatically_restored_at: null,
        manual_override_at: null,
      },
    ])
  })

  it('restores only the newest otherwise-public predecessor with a matching automatic epoch', async () => {
    const oldestId = await createReview([topicA])
    const middleId = await createReview([topicA])

    await reconcileReviewSuccessionsForPostIds([middleId])
    const newestId = await createReview([topicA])
    await reconcileReviewSuccessionsForPostIds([newestId])
    await setTestPostClearanceStatus(newestId, 'rejected', administrator.id)

    await expect(reconcileReviewSuccessionsForPostIds([newestId])).resolves.toEqual({
      changedPostIds: [middleId],
    })
    expect((await getPostArchivedFields(middleId))?.archived_at).toBeNull()
    expect((await getPostArchivedFields(oldestId))?.archived_at).not.toBeNull()
    await expect(listReviewSuccessionsForPostIds([oldestId, middleId])).resolves.toMatchObject([
      {
        predecessor_post_id: oldestId,
        successor_post_id: middleId,
        automatically_restored_at: null,
      },
      {
        predecessor_post_id: middleId,
        successor_post_id: newestId,
        automatically_restored_at: expect.any(Date),
      },
    ])
  })

  it('terminalizes only the manually acted-on predecessor epoch', async () => {
    const predecessorId = await createReview([topicB])
    const successorId = await createReview([topicB])

    await reconcileReviewSuccessionsForPostIds([successorId])
    await expect(terminalizeActiveReviewSuccessionForManualPost(successorId)).resolves.toBe(false)
    await expect(terminalizeActiveReviewSuccessionForManualPost(predecessorId)).resolves.toBe(true)
    await setTestPostClearanceStatus(successorId, 'rejected', administrator.id)

    await expect(reconcileReviewSuccessionsForPostIds([successorId])).resolves.toEqual({
      changedPostIds: [],
    })
    expect((await getPostArchivedFields(predecessorId))?.archived_at).not.toBeNull()
    await expect(listReviewSuccessionsForPostIds([predecessorId])).resolves.toMatchObject([
      {
        predecessor_post_id: predecessorId,
        successor_post_id: successorId,
        manual_override_at: expect.any(Date),
      },
    ])
  })

  it('treats an idempotent manual archive of an automatic predecessor as an override', async () => {
    const predecessorId = await createReview([topicB])
    const successorId = await createReview([topicB])

    await reconcileReviewSuccessionsForPostIds([successorId])
    await archivePost(predecessorId, author.id)
    await setTestPostClearanceStatus(successorId, 'rejected', administrator.id)
    await reconcileReviewSuccessionsForPostIds([successorId])

    expect((await getPostArchivedFields(predecessorId))?.archived_at).not.toBeNull()
    await expect(listReviewSuccessionsForPostIds([predecessorId])).resolves.toMatchObject([
      { manual_override_at: expect.any(Date), automatically_restored_at: null },
    ])
  })

  it('allows a manual unarchive to be re-archived while a newer successor remains eligible', async () => {
    const predecessorId = await createReview([topicB])
    const successorId = await createReview([topicB])

    await reconcileReviewSuccessionsForPostIds([successorId])
    await unarchivePost(predecessorId)

    expect((await getPostArchivedFields(predecessorId))?.archived_at).toBeNull()
    await expect(listReviewSuccessionsForPostIds([predecessorId])).resolves.toMatchObject([
      { manual_override_at: expect.any(Date), automatically_restored_at: null },
    ])
    await expect(reconcileReviewSuccessionsForPostIds([successorId])).resolves.toEqual({
      changedPostIds: [predecessorId],
    })
    expect((await getPostArchivedFields(predecessorId))?.archived_at).not.toBeNull()
    await expect(listReviewSuccessionsForPostIds([predecessorId])).resolves.toHaveLength(2)
  })

  it('replays a completed handoff without creating a second epoch', async () => {
    const predecessorId = await createReview([topicA, topicB])
    const successorId = await createReview([topicA, topicB])

    await reconcileReviewSuccessionsForPostIds([successorId])
    await expect(reconcileReviewSuccessionsForPostIds([successorId])).resolves.toEqual({
      changedPostIds: [],
    })
    await expect(listReviewSuccessionsForPostIds([predecessorId])).resolves.toHaveLength(1)
  })

  async function createReview(
    topicIds: readonly string[],
    clearanceStatus: 'pending' | 'approved' | 'rejected' | 'in_review' = 'approved',
  ): Promise<string> {
    const suffix = createRandomString(10)
    const postId = await insertTestPost({
      title: `Review succession ${suffix}`,
      slug: `review-succession-${suffix}`,
      createdById: author.id,
      markdown: 'Review succession test fixture.',
      postType: 'review',
      clearanceStatus,
    })
    await Promise.all(topicIds.map(topicId => insertTestPostReview(postId, topicId)))
    return postId
  }
})
