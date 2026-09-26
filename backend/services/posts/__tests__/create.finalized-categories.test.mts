import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  acquireTestPostFinalizationLock,
  createTestUser,
  insertTestTopic,
  updatePostTitleMarkdown,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { executePreparedContribution } from '@services/contribution-gating'
import { createPost, preparePostWithCommunityReviews } from '../create.mts'
import { POST_FINALIZATION_LOCK_NAMESPACE } from '../update/post-finalization-lock.mts'

describe('createPost finalized categories', () => {
  it('returns explicit topic categories after their votes are finalized', async () => {
    const user = await createTestUser()
    const suffix = Math.random().toString(36).slice(2, 12)
    const topicId = await insertTestTopic({
      name: `Explicit category ${suffix}`,
      slug: `explicit-category-${suffix}`,
      createdById: user.id,
    })

    const post = await createPost(WEB_PROVENANCE, user, {
      title: `Explicit category post ${suffix}`,
      categories: [{ type: 'topic', topic_id: topicId }],
    })

    expect(post!.post_related_topics).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: topicId })]),
    )
  })

  it('merges only finalized topics into the transaction-captured create response', async () => {
    const user = await createTestUser()
    const suffix = Math.random().toString(36).slice(2, 12)
    const originalTitle = `Exact create response ${suffix}`
    const laterTitle = `Later live title ${suffix}`
    const topicId = await insertTestTopic({
      name: `Exact response category ${suffix}`,
      slug: `exact-response-category-${suffix}`,
      createdById: user.id,
    })
    const postCommitStarted = Promise.withResolvers<void>()
    let postId = ''
    let finalizationLock: Awaited<ReturnType<typeof acquireTestPostFinalizationLock>> | undefined

    const creation = createPostWhileFinalizationIsLocked()

    async function createPostWhileFinalizationIsLocked() {
      await using query = await beginTransaction()
      const prepared = await preparePostWithCommunityReviews(
        WEB_PROVENANCE,
        user,
        {
          title: originalTitle,
          markdown: `Original body ${suffix}`,
          categories: [{ type: 'topic', topic_id: topicId }],
        },
        null,
        { query },
      )
      postId = prepared.response.post.id
      finalizationLock = await acquireTestPostFinalizationLock(
        POST_FINALIZATION_LOCK_NAMESPACE,
        postId,
      )
      const result = await executePreparedContribution(query, async () => ({
        response: prepared.response,
        finalize: async () => {
          postCommitStarted.resolve()
          return prepared.finalize()
        },
      }))
      await query.commit()
      return result
    }

    await postCommitStarted.promise
    try {
      await updatePostTitleMarkdown(postId, laterTitle, `Original body ${suffix}`)
    } finally {
      await finalizationLock?.release()
    }
    const response = await creation

    expect(response.post.title).toBe(originalTitle)
    expect(response.post.post_related_topics).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: topicId })]),
    )
  })
})
