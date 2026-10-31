import { randomUUID } from 'node:crypto'
import type { Job } from 'glide-mq'
import '@services/elections-votes'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { QUEUE_NAME } from '@queues/rss-feed-maintenance/config'
import { rssFeedMaintenance } from '@queues/rss-feed-maintenance/queues'
import { enqueueTopicAliasUnlinkPage } from '@queues/rss-feed-maintenance/enqueues/unlink-topic-alias'
import { upsertRssFeedItemCategories } from '@services/rss-feed-items/categories'
import { upsertRssFeedItems } from '@services/rss-feed-items/upsert'
import { getRssFeedCategories, upsertRssFeedCategories } from '@services/rss-feeds/categories'
import { createTopicAliases, unlinkTopicAlias } from '@services/topics/aliases'
import {
  createTestTopic,
  getTopicAliasCategoryMappingDirtyRowForTest,
  insertTestRssFeedDirect,
} from '@voucha/test-helpers'
import { getTestRssFeedItemCategories } from '@voucha/test-helpers/entities/rss-feed-item-categories'
import { selectTopicAliasUnlinkInitialPageForTest } from '@voucha/test-helpers/entities/topic-alias-unlink'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import { runRealRssMaintenanceJob } from '@voucha/test-helpers/real-rss-maintenance-job'
import { processRssFeedMaintenanceJob } from '../processors.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

function runJob(name: string, data: Record<string, unknown>): Promise<unknown> {
  return runRealRssMaintenanceJob(QUEUE_NAME, name, data, processRssFeedMaintenanceJob)
}

async function findOwnedJobs(name: string, match: Record<string, unknown>): Promise<Job[]> {
  return (await rssFeedMaintenance.searchJobs({ name })).filter(job =>
    Object.entries(match).every(
      ([key, value]) =>
        JSON.stringify((job.data as Record<string, unknown>)[key]) === JSON.stringify(value),
    ),
  )
}

async function runOwnedContinuation(
  name: string,
  match: Record<string, unknown>,
  ownedJobs: Job[],
  seenIds: Set<string>,
): Promise<{ data: Record<string, unknown>; result: unknown }> {
  const jobs = (await findOwnedJobs(name, match)).filter(job => !seenIds.has(job.id))
  expect(jobs).toHaveLength(1)
  const job = jobs[0]!
  seenIds.add(job.id)
  ownedJobs.push(job)
  const data = job.data as Record<string, unknown>
  return { data, result: await runJob(name, data) }
}

describe('RSS alias continuation jobs with real GlideMQ', () => {
  it('drains feed name and slug pages through admitted queue payloads', async () => {
    const ownedJobs: Job[] = []
    const seenIds = new Set<string>()
    onTestFinished(async () => {
      await Promise.all(ownedJobs.map(job => job.remove()))
    })
    const slug = `feed-${randomUUID()}`
    const feed = await createTestRssFeed({})
    await upsertRssFeedCategories(feed.id, [slug])
    expect(
      (await getRssFeedCategories(feed.id)).find(row => row.category_text === slug)?.topic_id,
    ).toBeNull()
    const topic = await createTestTopic({ slug, name: slug })

    const name = 'processBackfillRssFeedCategoriesForTopicAlias'
    const existing = await findOwnedJobs(name, { topicId: topic.id })
    ownedJobs.push(...existing)
    existing.forEach(job => seenIds.add(job.id))
    const first = (await runJob(name, { topicId: topic.id })) as {
      updated: number
      hasMore: boolean
      cursor: unknown
    }
    expect(first).toMatchObject({ updated: 1, hasMore: true })
    const continuation = await runOwnedContinuation(
      name,
      { topicId: topic.id, cursor: first.cursor },
      ownedJobs,
      seenIds,
    )
    expect(continuation.data).toEqual({ topicId: topic.id, cursor: first.cursor })
    expect(continuation.result).toMatchObject({ updated: 0, hasMore: false })
    expect(
      (await getRssFeedCategories(feed.id)).find(row => row.category_text === slug)?.topic_id,
    ).toBe(topic.id)
  })

  it('finishes the dedicated pending unlink before clearing item category ownership', async () => {
    const ownedJobs: Job[] = []
    const seenIds = new Set<string>()
    onTestFinished(async () => {
      await Promise.all(ownedJobs.map(job => job.remove()))
    })
    const suffix = randomUUID()
    const topic = await createTestTopic({ name: `Alias ${suffix}`, slug: `alias-${suffix}` })
    const feed = await insertTestRssFeedDirect({ topicId: topic.id })
    const [item] = await upsertRssFeedItems(feed.id, [
      { guid: suffix, link: `https://alias-${suffix}.example/item`, title: suffix },
    ])
    const [alias] = await createTopicAliases(topic.id, `alias-tag-${suffix}`)
    const categoryText = `#${alias!.alias}`
    await upsertRssFeedItemCategories([{ rss_feed_item_id: item!.id, categories: [categoryText] }])
    await unlinkTopicAlias(alias!.id, { expectedTopicId: topic.id, skipSideEffects: true })
    await runJob('processTopicAliasesUpdate', { topicId: topic.id, removedTopicAliasId: alias!.id })
    expect(
      (await getTestRssFeedItemCategories(item!.id)).find(row => row.category_text === categoryText)
        ?.topic_id,
    ).toBe(topic.id)

    const initial = await selectTopicAliasUnlinkInitialPageForTest(alias!.id, alias!.alias)
    await enqueueTopicAliasUnlinkPage(initial)
    let expected: typeof initial | null = initial
    const advances: { previous: typeof initial; next: typeof initial }[] = []
    for (let page = 0; page < 6 && expected; page += 1) {
      const queued = await runOwnedContinuation(
        'processUnlinkTopicAliasPage',
        expected,
        ownedJobs,
        seenIds,
      )
      const next: typeof initial | null = queued.result as typeof initial | null
      if (next) advances.push({ previous: expected, next })
      expected = next
    }
    expect(expected).toBeNull()
    expect(advances.length).toBeGreaterThan(0)
    for (const { previous, next } of advances) {
      expect(next.topicAliasId).toBe(alias!.id)
      expect(next).not.toEqual(previous)
    }
    expect(
      (await getTestRssFeedItemCategories(item!.id)).find(row => row.category_text === categoryText)
        ?.topic_id,
    ).toBeNull()
  })

  it('acknowledges a durable alias generation only after queued raw phases advance', async () => {
    const ownedJobs: Job[] = []
    const seenIds = new Set<string>()
    onTestFinished(async () => {
      await Promise.all(ownedJobs.map(job => job.remove()))
    })
    const topic = await createTestTopic({ slug: `mapping-${randomUUID()}` })
    const [alias] = await createTopicAliases(topic.id, `mapping-tag-${randomUUID()}`)
    const name = 'processReconcileTopicAliasCategoryMappings'
    expect(await getTopicAliasCategoryMappingDirtyRowForTest(alias!.id)).toBeDefined()
    const existing = await findOwnedJobs(name, { topicAliasIds: [alias!.id] })
    ownedJobs.push(...existing)
    existing.forEach(job => seenIds.add(job.id))
    const first = (await runJob(name, { topicAliasIds: [alias!.id] })) as {
      reconciled: number
      hasMore: boolean
    }
    expect(first).toMatchObject({ reconciled: 0, hasMore: true })
    let result = first
    for (let page = 0; page < 4 && result.hasMore; page += 1) {
      const queued = await runOwnedContinuation(
        name,
        { topicAliasIds: [alias!.id] },
        ownedJobs,
        seenIds,
      )
      expect(queued.data).toEqual({ topicAliasIds: [alias!.id] })
      result = queued.result as typeof first
    }
    expect(result).toMatchObject({ reconciled: 1, hasMore: false })
    expect(await getTopicAliasCategoryMappingDirtyRowForTest(alias!.id)).toBeUndefined()
  })
})
