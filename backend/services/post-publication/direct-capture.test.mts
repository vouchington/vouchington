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
import { enqueuePostPublicationEffects } from '@queues/post-publication/enqueues'
import { backgroundQueue as postPublicationQueue } from '@voucha/test-helpers/shared-background-queue'
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
    scopeStart: true,
    scopeTopicKeysCaptured: keys.some(key => key.kind === 'impact_topic'),
    keyOffset: 0,
  }
}

async function effectJobs(changeId: string) {
  return postPublicationQueue.searchJobs({
    name: 'post-publication.apply-effects',
    data: { changeId },
  })
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
    const job = (await effectJobs(changeId)).find(candidate =>
      (candidate.data as PostPublicationEffectsJobData).keys.some(
        key => key.kind === 'impact_post' && key.uuidValue === post.id,
      ),
    )
    if (!job) throw new Error('Expected captured alias effect')
    onTestFinished(async () => job.remove())
    expect(job.data).toMatchObject({ keys })
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

    const [job] = await effectJobs(changeId)
    if (!job) throw new Error('Expected captured post effect')
    onTestFinished(async () => job.remove())
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

    const [first] = await effectJobs(firstChangeId)
    const [second] = await effectJobs(secondChangeId)
    if (!first || !second) throw new Error('Expected both captured effects')
    const firstId = first.id
    const secondId = second.id
    onTestFinished(async () => {
      await Promise.all(
        [firstId, secondId].map(async id => (await postPublicationQueue.getJob(id))?.remove()),
      )
    })
    expect(firstId).not.toBe(secondId)
    expect(first).toMatchObject({ name: 'post-publication.apply-effects' })
    expect(second).toMatchObject({ name: 'post-publication.apply-effects' })
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
      rolledBackId = await recordPostPublicationChange(query, change)
    }
    expect(await effectJobs(rolledBackId)).toEqual([])

    await using query = await beginTransaction()
    let nestedId: string | undefined
    await expect(
      withTransactionOptions({ client: query.client }, async nested => {
        nestedId = await recordPostPublicationChange(nested, change)
        throw new Error('rollback nested publication capture')
      }),
    ).rejects.toThrow('rollback nested publication capture')
    const outerId = await recordPostPublicationChange(query, change)
    await query.commit()
    expect(await effectJobs(nestedId!)).toEqual([])
    const [outer] = await effectJobs(outerId)
    expect(outer).toBeDefined()
    onTestFinished(async () => outer?.remove())
  })
})
