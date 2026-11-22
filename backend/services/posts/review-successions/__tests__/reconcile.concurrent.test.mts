import { describe, expect, it, onTestFinished } from 'vitest'
import { postsWorkConfig } from '@services/posts/work-limits'
import {
  beginTransaction,
  createRandomString,
  createTestUser,
  getPostArchivedFields,
  insertTestPost,
  insertTestPostReview,
  insertTestTopic,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { createTestPostgresLockWaiter } from '@voucha/test-helpers/postgres-lock-waiter'
import { listReviewSuccessionsForPostIds } from '@voucha/test-helpers/post-review-successions'
import { reconcileReviewSuccessionsForPostPage } from '../reconcile.mts'
import { applyReviewSuccessionMutations } from '../mutations.mts'

describe('concurrent review succession reconciliation', () => {
  it('defers a predecessor exposed while waiting for the capped candidate page', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(postsWorkConfig, {
        review_succession_candidate_page_size: 2,
      }),
    )
    const author = await createTestUser()
    const topic = await createConcurrentReviewTopic(author.id)
    const oldestId = await createReview(author.id, topic)
    const predecessorId = await createReview(author.id, topic)
    const successorId = await createReview(author.id, topic)

    await using holder = await beginTransaction()
    const first = await reconcileReviewSuccessionsForPostPage(predecessorId, null, {
      query: holder,
    })
    await using waiter = await createTestPostgresLockWaiter({
      holder,
      lock: { kind: 'transaction' },
      selected: {
        marker: '/* lockReviewSuccessionCandidateRows */',
        binding: { index: 0, value: [predecessorId, successorId] },
      },
    })
    const competing = reconcileReviewSuccessionsForPostPage(successorId, null, {
      query: waiter.query,
    })
    await waiter.waitForLock(competing)
    await holder.commit()
    const second = await competing
    await waiter.query.commit()

    expect(first.changedPostIds).toEqual([predecessorId])
    expect(second.changedPostIds).toEqual([])
    expect((await getPostArchivedFields(oldestId))?.archived_at).toBeNull()
    expect(await listReviewSuccessionsForPostIds([predecessorId])).toMatchObject([
      { predecessor_post_id: predecessorId, successor_post_id: successorId },
    ])

    const followUp = await reconcileReviewSuccessionsForPostPage(successorId)
    expect(followUp.changedPostIds).toEqual([oldestId])
    expect((await getPostArchivedFields(successorId))?.archived_at).toBeNull()
  })

  it('records one epoch for competing archive plans targeting the same predecessor', async () => {
    const author = await createTestUser()
    const topic = await createConcurrentReviewTopic(author.id)
    const predecessorId = await createReview(author.id, topic)
    const successorId = await createReview(author.id, topic)
    const plan = {
      archives: [
        {
          predecessorPostId: predecessorId,
          successorPostId: successorId,
          authorUserId: author.id,
          topicIds: [topic],
        },
      ],
      restorations: [],
    }
    // The plans have no shared candidate lock. PostgreSQL arbitrates at the archive write.
    await using holder = await beginTransaction()
    const first = await applyReviewSuccessionMutations(holder, plan)
    await using waiter = await createTestPostgresLockWaiter({
      holder,
      lock: { kind: 'transaction' },
      selected: {
        marker: '/* archiveAutomaticReviewSuccessionPredecessors */',
        binding: {
          index: 0,
          value: JSON.stringify([
            {
              predecessor_post_id: predecessorId,
              successor_post_id: successorId,
              author_user_id: author.id,
              topic_ids: [topic],
            },
          ]),
        },
      },
    })
    const competing = applyReviewSuccessionMutations(waiter.query, plan)
    await waiter.waitForLock(competing)
    await holder.commit()
    const second = await competing
    await waiter.query.commit()

    expect(first).toEqual([predecessorId])
    expect(second).toEqual([])
    const archivedAt = (await getPostArchivedFields(predecessorId))?.archived_at
    expect(archivedAt).toBeInstanceOf(Date)
    expect(await listReviewSuccessionsForPostIds([predecessorId])).toMatchObject([
      {
        predecessor_post_id: predecessorId,
        successor_post_id: successorId,
        predecessor_archived_at: archivedAt,
        topic_ids: [topic],
        automatically_restored_at: null,
        manual_override_at: null,
      },
    ])
  })

  function createConcurrentReviewTopic(authorId: string): Promise<string> {
    const suffix = createRandomString(8)
    return insertTestTopic({
      name: `Concurrent review succession ${suffix}`,
      slug: `concurrent-review-succession-${suffix}`,
      createdById: authorId,
    })
  }

  async function createReview(authorId: string, topicId: string): Promise<string> {
    const suffix = createRandomString(10)
    const postId = await insertTestPost({
      title: `Concurrent review ${suffix}`,
      slug: `concurrent-review-${suffix}`,
      createdById: authorId,
      markdown: 'Concurrent review succession fixture.',
      postType: 'review',
      clearanceStatus: 'approved',
    })
    await insertTestPostReview(postId, topicId)
    return postId
  }
})
