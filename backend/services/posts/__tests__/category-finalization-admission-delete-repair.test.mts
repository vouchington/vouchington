import { describe, expect, it } from 'vitest'
import {
  createTestPost,
  createTestUser,
  hasTestPostCategoryAdmissionResponseFinalization,
  insertTestTopic,
} from '@voucha/test-helpers'
import { runContributionAdmission } from '@services/contribution-gating'
import { syncPostExplicitTopicCategoriesInTransaction } from '../explicit-topic-categories.mts'
import { getPostByAny } from '../get.mts'
import { finalizePostHashtagCategoryVotes } from '../hashtag-votes.mts'
import {
  acknowledgePostCategoryFinalization,
  persistPostCategoryFinalization,
} from '../post-category-finalizations.mts'
import { withPostFinalizationLock } from '../update/post-finalization-lock.mts'

describe('post category finalization admission delete repair', () => {
  it('repairs a retained create response through the exact-generation acknowledgement', async () => {
    const owner = await createTestUser()
    const suffix = Math.random().toString(36).slice(2, 12)
    const topicId = await insertTestTopic({
      name: `Acknowledgement recovery ${suffix}`,
      slug: `acknowledgement-recovery-${suffix}`,
      createdById: owner.id,
    })
    const post = await createTestPost({
      user: owner,
      title: `Acknowledgement recovery ${suffix}`,
    })
    const pending = await withPostFinalizationLock(post.id, async () => {
      await syncPostExplicitTopicCategoriesInTransaction(
        post.id,
        [{ type: 'topic', topic_id: topicId }],
        {},
      )
      return persistPostCategoryFinalization(post.id, owner.id, owner.id, 'create', {})
    })
    const stalePost = (await getPostByAny(post.id, { readOnly: false }))!
    const idempotencyKey = crypto.randomUUID()
    const replay = () =>
      runContributionAdmission({
        actorId: owner.id,
        idempotencyKey,
        intent: { request: `acknowledgement-${suffix}` },
        execute: async () => stalePost,
      })

    await replay()
    await expect(hasTestPostCategoryAdmissionResponseFinalization(post.id)).resolves.toBe(true)
    await finalizePostHashtagCategoryVotes(owner, post.id, owner.id)
    await acknowledgePostCategoryFinalization(pending)

    await expect(hasTestPostCategoryAdmissionResponseFinalization(post.id)).resolves.toBe(false)
    await expect(replay()).resolves.toMatchObject({
      kind: 'replay',
      response: {
        post_related_topics: expect.arrayContaining([expect.objectContaining({ id: topicId })]),
      },
    })
  })
})
