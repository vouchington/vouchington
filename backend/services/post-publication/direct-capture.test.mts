import { randomUUID } from 'node:crypto'
import {
  beginTransaction,
  captureScopedTestQueries,
  countCapturedQueriesByAnnotation,
  createActivePostTopicAliasRelationForTest,
  createTestPost,
  createTestTopic,
  createTestUser,
  insertTestPost,
  withTransactionOptions,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers'
import { captureAddedPublicationEffectsForScopes } from '@voucha/test-helpers/publication-effect-jobs'
import {
  deleteTestPostRow,
  deleteTestTopicAlias,
  readTestPostPreimageForUpdate,
} from '../../test-helpers/publication-test-queries.mts'
import { createTopicAliases } from '../topics/aliases.mts'
import {
  enqueuePostPublicationEffects,
  postPublicationEffectJobId,
} from '@queues/post-publication/enqueues'
import { postPublicationQueue } from '@queues/post-publication/queues'
import { describe, expect, it, onTestFinished } from 'vitest'
import type { PostPublicationEffectsJobData } from '@voucha/types/post-publication'
import { capturedPublicationKeys, hashCapturedPublicationKeys } from './captured-keys.mts'
import { recordPostPublicationChange } from './capture.mts'
import { lockPostPublicationPostScopes, recordPostPublicationChanges } from './capture-posts.mts'
import { postPublicationWorkConfig } from './work-limits.mts'
import { captureDestroyedTopicAliasPostImpacts } from './capture-topic-alias.mts'
import type { PostPublicationChange } from './types.mts'

function effectPayload(
  changeId: string,
  change: PostPublicationChange,
): PostPublicationEffectsJobData {
  const keys = capturedPublicationKeys(change)
  if (change.scope.type !== 'post') throw new Error('Expected post capture')
  return {
    changeId,
    postId: change.scope.postId,
    scope: { type: 'post', id: change.scope.postId },
    reason: change.reason,
    keys,
    keyHash: hashCapturedPublicationKeys(keys),
    chunkIndex: 0,
  }
}

function effectId(changeId: string, change: PostPublicationChange): string {
  return postPublicationEffectJobId(effectPayload(changeId, change))
}

describe('direct post-publication capture', () => {
  it('locks each post scope once across repeated capture paths in one transaction', async () => {
    const postId = randomUUID()
    const queries = await captureScopedTestQueries(async () => {
      await using query = await beginTransaction()
      await lockPostPublicationPostScopes(query, [postId])
      await recordPostPublicationChanges(query, 'post_topics_changed', [
        { postId, impactedPostIds: [postId] },
      ])
      await recordPostPublicationChange(query, {
        scope: { type: 'post', postId },
        reason: 'post_topics_changed',
        impactedPostIds: [postId],
      })
      await query.rollback()
    })
    expect(countCapturedQueriesByAnnotation(queries, 'lockPostPublicationCaptures')).toBe(1)
    expect(countCapturedQueriesByAnnotation(queries, 'lockPostPublicationScope')).toBe(0)
  })

  it('captures every post when a producer batch exceeds the configured capture page', async () => {
    const restore = overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, {
      capture_batch_size: 2,
    })
    onTestFinished(restore)
    const postIds = Array.from({ length: 3 }, () => randomUUID())
    const jobs = await captureAddedPublicationEffectsForScopes(postIds, async () => {
      await using query = await beginTransaction()
      await recordPostPublicationChanges(
        query,
        'post_topics_changed',
        postIds.map(postId => ({ postId, impactedPostIds: [postId] })),
      )
      await query.commit()
    })
    expect(jobs).toHaveLength(postIds.length)
    for (const postId of postIds) {
      const job = jobs.find(job => job.scope.id === postId)
      expect(job?.keys).toContainEqual({ kind: 'impact_post', uuidValue: postId })
    }
  })

  it('retains a source-less alias relation before its delete cascade', async () => {
    const user = await createTestUser({ administrator: true })
    const topic = await createTestTopic({ user, name: `Alias preimage ${randomUUID()}` })
    const [alias] = await createTopicAliases(topic.id, `ordinary preimage ${randomUUID()}`)
    if (!alias) throw new Error('Expected ordinary alias')
    const post = await createTestPost({ user, title: `Alias member ${randomUUID()}` })
    await createActivePostTopicAliasRelationForTest({
      postId: post.id,
      topicAliasId: alias.id,
      userId: user.id,
    })

    await using query = await beginTransaction()
    const changeId = await recordPostPublicationChange(query, {
      scope: { type: 'topic_alias', topicAliasId: alias.id },
      reason: 'post_topics_changed',
      impactedTopicIds: [topic.id],
      topicAliasText: alias.alias,
    })
    await captureDestroyedTopicAliasPostImpacts(query, changeId, alias.id)
    await deleteTestTopicAlias(query, alias.id)
    await query.commit()

    const keys = [{ kind: 'impact_post' as const, uuidValue: post.id }]
    const id = postPublicationEffectJobId({
      changeId,
      postId: null,
      scope: { type: 'topic_alias', id: alias.id },
      reason: 'post_topics_changed',
      keys,
      keyHash: hashCapturedPublicationKeys(keys),
      chunkIndex: 0,
    })
    onTestFinished(async () => (await postPublicationQueue.getJob(id))?.remove())
    expect((await postPublicationQueue.getJob(id))?.data).toMatchObject({ keys })
  })

  it('keeps every captured predelete key without a receipt after its row is removed', async () => {
    const author = await createTestUser()
    const topic = await createTestTopic({
      user: author,
      hostname: `predelete-${randomUUID()}.example.com`,
    })
    const slug = `predelete-${randomUUID()}`
    const postId = await insertTestPost({
      createdById: author.id,
      markdown: 'Captured before physical deletion',
      slug,
      title: 'Predelete capture',
    })
    await using query = await beginTransaction()
    const post = await readTestPostPreimageForUpdate(query, postId)
    if (!post || !author.username) throw new Error('Expected authored post preimage')
    const change: PostPublicationChange = {
      scope: { type: 'post', postId },
      reason: 'post_deleted',
      impactedPostIds: [postId],
      impactedTopicIds: [topic.id],
      footprint: {
        priorAuthorUserId: author.id,
        priorAuthorUsername: author.username,
        priorPostSlug: slug,
        priorSitemapTarget: {
          postType: post.post_type,
          day: post.created_at.toISOString().slice(0, 10),
        },
      },
    }
    const changeId = await recordPostPublicationChange(query, change)
    await deleteTestPostRow(query, postId)
    await query.commit()

    const id = effectId(changeId, change)
    onTestFinished(async () => (await postPublicationQueue.getJob(id))?.remove())
    const job = await postPublicationQueue.getJob(id)
    expect((job?.data as PostPublicationEffectsJobData | undefined)?.keys).toEqual(
      expect.arrayContaining([
        { kind: 'impact_post', uuidValue: postId },
        { kind: 'impact_topic', uuidValue: topic.id },
        { kind: 'identity_author', uuidValue: author.id },
        { kind: 'identity_author_username', textValue: author.username },
        { kind: 'identity_post_slug', textValue: slug },
        {
          kind: 'sitemap_target',
          postType: post.post_type,
          day: post.created_at.toISOString().slice(0, 10),
        },
      ]),
    )
  })

  it('admits separate jobs for two committed edits with identical keys and deduplicates one retry', async () => {
    const postId = randomUUID()
    const change: PostPublicationChange = {
      scope: { type: 'post', postId },
      reason: 'post_updated',
      impactedTopicIds: [randomUUID()],
    }
    await using query = await beginTransaction()
    const firstChangeId = await recordPostPublicationChange(query, change)
    const secondChangeId = await recordPostPublicationChange(query, change)
    await query.commit()

    const firstId = effectId(firstChangeId, change)
    const secondId = effectId(secondChangeId, change)
    onTestFinished(async () => {
      await Promise.all(
        [firstId, secondId].map(async id => (await postPublicationQueue.getJob(id))?.remove()),
      )
    })
    expect(firstId).not.toBe(secondId)
    const first = await postPublicationQueue.getJob(firstId)
    const second = await postPublicationQueue.getJob(secondId)
    expect(first).toMatchObject({ name: 'post-publication.apply-effects' })
    expect(second).toMatchObject({ name: 'post-publication.apply-effects' })
    if (!first) throw new Error('Expected first captured job')
    const duplicate = await enqueuePostPublicationEffects(effectPayload(firstChangeId, change))
    expect(duplicate).toBeNull()
  })

  it('enqueues nothing from a rolled-back transaction or nested scope', async () => {
    const change: PostPublicationChange = {
      scope: { type: 'post', postId: randomUUID() },
      reason: 'post_updated',
    }
    let rolledBackId: string
    {
      await using query = await beginTransaction()
      rolledBackId = effectId(await recordPostPublicationChange(query, change), change)
    }
    expect(await postPublicationQueue.getJob(rolledBackId)).toBeNull()

    await using query = await beginTransaction()
    let nestedId: string | undefined
    await expect(
      withTransactionOptions({ client: query.client }, async nested => {
        nestedId = effectId(await recordPostPublicationChange(nested, change), change)
        throw new Error('rollback nested publication capture')
      }),
    ).rejects.toThrow('rollback nested publication capture')
    const outerId = effectId(await recordPostPublicationChange(query, change), change)
    onTestFinished(async () => (await postPublicationQueue.getJob(outerId))?.remove())
    await query.commit()
    expect(await postPublicationQueue.getJob(nestedId!)).toBeNull()
    expect(await postPublicationQueue.getJob(outerId)).not.toBeNull()
  })
})
