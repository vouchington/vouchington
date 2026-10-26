import { getTestRssFeedItemCategories } from '@voucha/test-helpers/entities/rss-feed-item-categories'
import { randomUUID } from 'node:crypto'
import '@services/elections-votes'
import { Queue, Worker, type Job } from 'glide-mq'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { notifications } from '@queues/notifications/queues'
import { QUEUE_NAME } from '@queues/rss-feed-maintenance/config'
import { rssFeedMaintenance } from '@queues/rss-feed-maintenance/queues'
import { topicsWorkConfig } from '@services/topics/work-limits'
import { upsertRssFeedItemCategories } from '@services/rss-feed-items/categories'
import { upsertRssFeedItems } from '@services/rss-feed-items/upsert'
import { getRssFeedCategories, upsertRssFeedCategories } from '@services/rss-feeds/categories'
import { createTopicAliases, unlinkTopicAlias } from '@services/topics/aliases'
import {
  createTestPost,
  createTestTopic,
  createTestUser,
  createTopHashtagPostSourceForTest,
  getTestRssFeedItemCategorySnapshotReconciliation,
  getLatestTestRssFeedStateChange,
  getTopicAliasCategoryMappingDirtyRowForTest,
  insertTestRssFeedDirect,
  setRssFeedOwningTopicVoteScore,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import { processRssFeedMaintenanceJob } from './processors.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

async function runJob(name: string, data: Record<string, unknown>): Promise<unknown> {
  const prefix = `${workerQueuePrefix}-rss-maintenance-${randomUUID()}`
  const queue = new Queue(QUEUE_NAME, { connection: workerQueueConnection, prefix })
  let worker: Worker | undefined
  const completed = Promise.withResolvers<unknown>()
  try {
    const job = await queue.add(name, data, { priority: 10, attempts: 1 })
    if (!job) throw new Error(`Expected ${name} to enqueue`)
    worker = new Worker(QUEUE_NAME, (current: Job) => processRssFeedMaintenanceJob(current), {
      connection: workerQueueConnection,
      prefix,
      concurrency: 1,
      blockTimeout: 100,
    })
    worker.on('error', error => completed.reject(error))
    worker.on('failed', (_failed, error) => completed.reject(error))
    worker.on('completed', (done: Job, result) => {
      if (done.id === job.id) completed.resolve(result)
    })
    return await waitForRealGlideEvent(completed.promise, `RSS maintenance ${name}`)
  } finally {
    await worker?.close()
    await queue.obliterate({ force: true })
    await queue.close()
  }
}

describe('merged RSS feed maintenance worker with real GlideMQ', () => {
  it('serves every hard-delete page job name through the live worker registry', async () => {
    const rssFeedId = randomUUID()
    await expect(
      runJob('processHardDeleteRssFeedSourcePage', { rssFeedId, pageCursor: rssFeedId }),
    ).resolves.toBeUndefined()
    await expect(
      runJob('processHardDeleteRssFeedChildPage', {
        rssFeedId,
        pageCursor: rssFeedId,
        phase: 'setting_changes',
      }),
    ).resolves.toBeUndefined()
    await expect(runJob('processFinalizeHardDeleteRssFeed', { rssFeedId })).resolves.toBeUndefined()
  })

  it('rejects malformed discoverability payloads and unknown job names', async () => {
    await expect(runJob('processEvaluateRssFeedDiscoverability', {})).rejects.toThrow(
      'RSS feed discoverability job .rssFeedId is required',
    )
    await expect(runJob('missingJob', {})).rejects.toThrow(
      'RSS feed maintenance job missingJob not found',
    )
  })

  it('acknowledges a durable item category snapshot and applies its category', async () => {
    const suffix = randomUUID()
    const feed = await insertTestRssFeedDirect({})
    const category = `snapshot-${suffix}`
    const [item] = await upsertRssFeedItems(feed.id, [
      {
        categories: [category],
        guid: suffix,
        link: `https://rss-${suffix}.example/item`,
        title: suffix,
      },
    ])
    expect(await getTestRssFeedItemCategorySnapshotReconciliation(item!.id)).toBeDefined()

    const result = await runJob('processReconcileRssFeedItemCategorySnapshots', {
      rssFeedItemIds: [item!.id],
    })
    expect(result).toMatchObject({ reconciled: 1 })
    expect(await getTestRssFeedItemCategorySnapshotReconciliation(item!.id)).toBeUndefined()
    expect(await getTestRssFeedItemCategories(item!.id)).toEqual([
      expect.objectContaining({ category_text: category }),
    ])
  })

  it('backfills item categories against a newly created topic', async () => {
    const suffix = randomUUID()
    const slug = `item-${suffix}`
    const feed = await insertTestRssFeedDirect({})
    const [item] = await upsertRssFeedItems(feed.id, [
      {
        guid: suffix,
        link: `https://rss-${suffix}.example/item`,
        title: suffix,
      },
    ])
    await upsertRssFeedItemCategories([{ rss_feed_item_id: item!.id, categories: [slug] }])
    expect(
      (await getTestRssFeedItemCategories(item!.id)).find(row => row.category_text === slug)
        ?.topic_id,
    ).toBeNull()
    const topic = await createTestTopic({ slug, name: slug })

    const result = await runJob('processBackfillCategoriesForTopicAliases', { topicId: topic.id })
    expect(result).toMatchObject({ updated: expect.any(Number) })
    expect(
      (await getTestRssFeedItemCategories(item!.id)).find(row => row.category_text === slug)
        ?.topic_id,
    ).toBe(topic.id)
  })

  it('backfills feed-level categories against a newly created topic', async () => {
    const slug = `feed-${randomUUID()}`
    const feed = await createTestRssFeed({})
    await upsertRssFeedCategories(feed.id, [slug])
    expect(
      (await getRssFeedCategories(feed.id)).find(row => row.category_text === slug)?.topic_id,
    ).toBeNull()
    const topic = await createTestTopic({ slug, name: slug })

    const result = await runJob('processBackfillRssFeedCategoriesForTopicAlias', {
      topicId: topic.id,
    })
    expect(result).toEqual({ updated: 1, hasMore: false })
    expect(
      (await getRssFeedCategories(feed.id)).find(row => row.category_text === slug)?.topic_id,
    ).toBe(topic.id)
  })

  it('evaluates and persists RSS feed discoverability', async () => {
    const feed = await createTestRssFeed({})
    await setRssFeedOwningTopicVoteScore(feed.id, 0, 6)
    await expect(
      runJob('processEvaluateRssFeedDiscoverability', { rssFeedId: feed.id }),
    ).resolves.toBe('updated')
    await expect(
      getLatestTestRssFeedStateChange('discoverability', feed.id),
    ).resolves.toMatchObject({
      reason: expect.stringContaining('auto:'),
    })
  })

  it('updates an unlinked alias and clears its item category ownership', async () => {
    const suffix = randomUUID()
    const topic = await createTestTopic({ name: `Alias ${suffix}`, slug: `alias-${suffix}` })
    const feed = await insertTestRssFeedDirect({ topicId: topic.id })
    const [item] = await upsertRssFeedItems(feed.id, [
      { guid: suffix, link: `https://alias-${suffix}.example/item`, title: suffix },
    ])
    const [alias] = await createTopicAliases(topic.id, `alias-tag-${suffix}`)
    await upsertRssFeedItemCategories([
      { rss_feed_item_id: item!.id, categories: [`#${alias!.alias}`] },
    ])
    await unlinkTopicAlias(alias!.id, { expectedTopicId: topic.id, skipSideEffects: true })
    await runJob('processTopicAliasesUpdate', { topicId: topic.id, removedTopicAliasId: alias!.id })
    expect(
      (await getTestRssFeedItemCategories(item!.id)).find(
        row => row.category_text === `#${alias!.alias}`,
      )?.topic_id,
    ).toBeNull()
  })

  it('invalidates real post aliases and enqueues notification reconciliation', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(topicsWorkConfig, {
        alias_post_invalidation_batch_size: 1,
      }),
    )
    const suffix = randomUUID()
    const user = await createTestUser({ administrator: true })
    const topic = await createTestTopic({ name: `Post ${suffix}`, slug: `post-${suffix}` })
    const [alias] = await createTopicAliases(topic.id, `post-tag-${suffix}`)
    const posts = await Promise.all(
      [0, 1].map(index => createTestPost({ user, title: `Post ${index} ${suffix}` })),
    )
    await Promise.all(
      posts.map(post =>
        createTopHashtagPostSourceForTest({
          postId: post.id,
          topicAliasId: alias!.id,
          userId: user.id,
          authoredToken: `#post-${suffix}`,
        }),
      ),
    )
    const changeId = randomUUID()
    const laterChangeId = randomUUID()
    const ownedJobs: Job[] = []
    onTestFinished(async () => {
      await Promise.all(ownedJobs.map(job => job.remove()))
    })
    const data = { topicAliasIds: [alias!.id], changeId }
    const first = posts.map(post => post.id).toSorted()[0]!
    expect(await runJob('processInvalidatePostsForTopicAliases', data)).toEqual({
      lastPostId: first,
      hasMore: true,
    })
    await runJob('processInvalidatePostsForTopicAliases', data)
    const pages = await rssFeedMaintenance.searchJobs({
      name: 'processInvalidatePostsForTopicAliases',
      data: { changeId },
    })
    ownedJobs.push(...pages)
    expect(pages).toHaveLength(1)
    expect(pages[0]!.data).toEqual({ ...data, afterPostId: first })
    await runJob('processInvalidatePostsForTopicAliases', pages[0]!.data as Record<string, unknown>)
    const original = await notifications.searchJobs({
      name: 'notifications.processReconcilePostNotifications',
      data: { changeId },
    })
    ownedJobs.push(...original)
    expect(original.map(job => (job.data as { postId: string }).postId).toSorted()).toEqual(
      posts.map(post => post.id).toSorted(),
    )
    await runJob('processInvalidatePostsForTopicAliases', { ...data, changeId: laterChangeId })
    const later = await notifications.searchJobs({
      name: 'notifications.processReconcilePostNotifications',
      data: { changeId: laterChangeId },
    })
    const laterPages = await rssFeedMaintenance.searchJobs({
      name: 'processInvalidatePostsForTopicAliases',
      data: { changeId: laterChangeId },
    })
    ownedJobs.push(...later, ...laterPages)
    expect(later).toHaveLength(1)
    expect(later[0]!.id).not.toBe(
      original.find(job => (job.data as { postId: string }).postId === first)!.id,
    )
  })

  it('consumes durable alias category-mapping reconciliation work', async () => {
    const topic = await createTestTopic({ slug: `mapping-${randomUUID()}` })
    const [alias] = await createTopicAliases(topic.id, `mapping-tag-${randomUUID()}`)
    expect(await getTopicAliasCategoryMappingDirtyRowForTest(alias!.id)).toBeDefined()
    const result = await runJob('processReconcileTopicAliasCategoryMappings', {
      topicAliasIds: [alias!.id],
    })
    expect(result).toMatchObject({ reconciled: 1 })
    expect(await getTopicAliasCategoryMappingDirtyRowForTest(alias!.id)).toBeUndefined()
  })
})
