import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestPost,
  createTestUser,
  hasTestPostCategoryAdmissionResponseFinalization,
  insertTestTopic,
  relatePostToTopic,
  updatePostTitleMarkdown,
} from '@voucha/test-helpers'
import { runContributionAdmission } from '@services/contribution-gating'
import { syncPostExplicitTopicCategoriesInTransaction } from '../explicit-topic-categories.mts'
import { getPostByAny } from '../get.mts'
import {
  persistPostCategoryFinalization,
  reconcilePostCategoryFinalizationRows,
} from '../post-category-finalizations.mts'
import { withPostFinalizationLock } from '../update/post-finalization-lock.mts'
import { updatePost } from '../update.mts'

describe('post category finalization admission replay', () => {
  it('refreshes create responses after recovery without applying later edits', async () => {
    const owner = await createTestUser()
    const moderator = await createTestUser({ administrator: true })
    const suffix = Math.random().toString(36).slice(2, 12)
    const topicId = await insertTestTopic({
      name: `Admission recovery ${suffix}`,
      slug: `admission-recovery-${suffix}`,
      createdById: owner.id,
    })
    const post = await createTestPost({ user: owner, title: `Admission recovery ${suffix}` })
    const manualTopicId = await insertTestTopic({
      name: `Manual admission recovery ${suffix}`,
      slug: `manual-admission-recovery-${suffix}`,
      createdById: moderator.id,
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
    expect(stalePost.post_related_topics).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: topicId })]),
    )

    const directKey = crypto.randomUUID()
    const wrappedKey = crypto.randomUUID()
    const directIntent = { request: `direct-${suffix}` }
    const wrappedIntent = { request: `wrapped-${suffix}` }
    let directExecutions = 0
    let wrappedExecutions = 0
    const createDirect = () =>
      runContributionAdmission({
        actorId: owner.id,
        idempotencyKey: directKey,
        intent: directIntent,
        execute: async () => {
          directExecutions += 1
          return stalePost
        },
      })
    const createWrapped = () =>
      runContributionAdmission({
        actorId: owner.id,
        idempotencyKey: wrappedKey,
        intent: wrappedIntent,
        execute: async () => {
          wrappedExecutions += 1
          return { post: stalePost, context: 'preserved' }
        },
      })

    await createDirect()
    await createWrapped()
    await relatePostToTopic(moderator, post, { id: manualTopicId })
    await reconcilePostCategoryFinalizationRows([pending])

    const finalizedPost = (await getPostByAny(post.id, { readOnly: false }))!
    expect(finalizedPost.post_related_topics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: topicId }),
        expect.objectContaining({ id: manualTopicId }),
      ]),
    )

    const directReplayAfterRecovery = await createDirect()
    const wrappedReplayAfterRecovery = await createWrapped()
    expect(directReplayAfterRecovery).toMatchObject({
      kind: 'replay',
      response: {
        post_related_topics: expect.arrayContaining([expect.objectContaining({ id: topicId })]),
      },
    })
    expect(directReplayAfterRecovery).not.toMatchObject({
      response: {
        post_related_topics: expect.arrayContaining([
          expect.objectContaining({ id: manualTopicId }),
        ]),
      },
    })
    expect(wrappedReplayAfterRecovery).toMatchObject({
      kind: 'replay',
      response: {
        context: 'preserved',
        post: {
          post_related_topics: expect.arrayContaining([expect.objectContaining({ id: topicId })]),
        },
      },
    })
    expect(wrappedReplayAfterRecovery).not.toMatchObject({
      response: {
        post: {
          post_related_topics: expect.arrayContaining([
            expect.objectContaining({ id: manualTopicId }),
          ]),
        },
      },
    })

    const laterTopicId = await insertTestTopic({
      name: `Later admission recovery edit ${suffix}`,
      slug: `later-admission-recovery-edit-${suffix}`,
      createdById: owner.id,
    })
    await updatePost(owner, (await getPostByAny(post.id, { readOnly: false }))!, {
      categories: [{ type: 'topic', topic_id: laterTopicId }],
    })

    const directReplay = await createDirect()
    const wrappedReplay = await createWrapped()
    expect(directReplay).toMatchObject({
      kind: 'replay',
      response: {
        post_related_topics: expect.arrayContaining([expect.objectContaining({ id: topicId })]),
      },
    })
    expect(directReplay).not.toMatchObject({
      response: {
        post_related_topics: expect.arrayContaining([
          expect.objectContaining({ id: laterTopicId }),
        ]),
      },
    })
    expect(wrappedReplay).toMatchObject({
      kind: 'replay',
      response: {
        context: 'preserved',
        post: {
          post_related_topics: expect.arrayContaining([expect.objectContaining({ id: topicId })]),
        },
      },
    })
    expect(wrappedReplay).not.toMatchObject({
      response: {
        post: {
          post_related_topics: expect.arrayContaining([
            expect.objectContaining({ id: laterTopicId }),
          ]),
        },
      },
    })
    expect(directExecutions).toBe(1)
    expect(wrappedExecutions).toBe(1)
  })

  it('removes a pending create marker when a category update supersedes its generation', async () => {
    const owner = await createTestUser()
    const suffix = Math.random().toString(36).slice(2, 12)
    const initialTopicId = await insertTestTopic({
      name: `Pending create category ${suffix}`,
      slug: `pending-create-category-${suffix}`,
      createdById: owner.id,
    })
    const laterTopicId = await insertTestTopic({
      name: `Superseding category ${suffix}`,
      slug: `superseding-category-${suffix}`,
      createdById: owner.id,
    })
    const post = await createTestPost({ user: owner, title: `Superseded recovery ${suffix}` })
    await using createFinalizationQuery = await beginTransaction()
    await syncPostExplicitTopicCategoriesInTransaction(
      post.id,
      [{ type: 'topic', topic_id: initialTopicId }],
      { query: createFinalizationQuery },
    )
    const createFinalization = await persistPostCategoryFinalization(
      post.id,
      owner.id,
      owner.id,
      'create',
      { query: createFinalizationQuery },
    )
    await createFinalizationQuery.commit()
    const stalePost = (await getPostByAny(post.id, { readOnly: false }))!
    let executions = 0
    const replay = () =>
      runContributionAdmission({
        actorId: owner.id,
        idempotencyKey: post.id,
        intent: { request: `superseded-${suffix}` },
        execute: async () => {
          executions += 1
          return stalePost
        },
      })
    await replay()
    await expect(hasTestPostCategoryAdmissionResponseFinalization(post.id)).resolves.toBe(true)
    await using updateFinalizationQuery = await beginTransaction()
    await syncPostExplicitTopicCategoriesInTransaction(
      post.id,
      [{ type: 'topic', topic_id: laterTopicId }],
      { query: updateFinalizationQuery },
    )
    const updateFinalization = await persistPostCategoryFinalization(
      post.id,
      owner.id,
      owner.id,
      'update',
      { query: updateFinalizationQuery },
    )
    await updateFinalizationQuery.commit()
    await expect(hasTestPostCategoryAdmissionResponseFinalization(post.id)).resolves.toBe(false)

    await reconcilePostCategoryFinalizationRows([createFinalization, updateFinalization])
    const result = await replay()
    expect(result).toMatchObject({
      kind: 'replay',
      response: { post_related_topics: [] },
    })
    expect(executions).toBe(1)
  })

  it('completes an in-flight pre-marker response without rewriting it', async () => {
    const owner = await createTestUser()
    const suffix = Math.random().toString(36).slice(2, 12)
    const post = await createTestPost({ user: owner, title: `Pre-marker recovery ${suffix}` })
    const pending = await persistPostCategoryFinalization(post.id, owner.id, owner.id, 'update', {})
    const originalResponse = {
      post: (await getPostByAny(post.id, { readOnly: false }))!,
      context: `pre-marker-${suffix}`,
    }
    let executions = 0
    const replay = () =>
      runContributionAdmission({
        actorId: owner.id,
        idempotencyKey: post.id,
        intent: { request: `pre-marker-${suffix}` },
        execute: async () => {
          executions += 1
          return originalResponse
        },
      })

    await replay()
    await expect(hasTestPostCategoryAdmissionResponseFinalization(post.id)).resolves.toBe(false)
    await updatePostTitleMarkdown(
      post.id,
      `Later live title ${suffix}`,
      originalResponse.post.markdown,
    )
    await reconcilePostCategoryFinalizationRows([pending])

    await expect(replay()).resolves.toMatchObject({
      kind: 'replay',
      response: {
        context: originalResponse.context,
        post: { id: post.id, title: originalResponse.post.title },
      },
    })
    expect(executions).toBe(1)
  })
})
