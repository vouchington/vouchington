import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { rssFeedMaintenance } from '@queues/rss-feed-maintenance/queues'
import { upsertRssFeedItemCategories } from '@services/rss-feed-items/categories'
import { rssFeedItemsWorkConfig } from '@services/rss-feed-items/work-limits'
import { upsertRssFeedItems } from '@services/rss-feed-items/upsert'
import { upsertRssFeedCategories, getRssFeedCategories } from '@services/rss-feeds/categories'
import {
  createTestTopic,
  getTestRssFeedItemCategorySnapshotReconciliation,
  insertTestRssFeedDirect,
  readAllQueueJobs,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { getTestRssFeedItemCategories } from '@voucha/test-helpers/entities/rss-feed-item-categories'
import {
  processBackfillCategoriesForTopicAliases,
  processBackfillRssFeedCategoriesForTopicAlias,
  processReconcileRssFeedItemCategorySnapshots,
} from './item-categories.mts'

async function insertSnapshotItem(suffix: string, category: string) {
  const feed = await insertTestRssFeedDirect({})
  const [item] = await upsertRssFeedItems(feed.id, [
    {
      categories: [category],
      guid: suffix,
      link: `https://snapshot-${suffix}.example/item`,
      title: suffix,
    },
  ])
  return item!
}

async function ownedSnapshotJobs(itemId: string) {
  return (await readAllQueueJobs(rssFeedMaintenance)).filter(
    job =>
      job.name === 'processReconcileRssFeedItemCategorySnapshots' &&
      (job.data as { rssFeedItemIds?: string[] }).rssFeedItemIds?.includes(itemId),
  )
}

describe('rss feed item category processors', () => {
  it('backfills item categories for a newly created topic', async () => {
    const suffix = randomUUID()
    const slug = `item-${suffix}`
    const feed = await insertTestRssFeedDirect({})
    const [item] = await upsertRssFeedItems(feed.id, [
      { guid: suffix, link: `https://item-${suffix}.example/item`, title: suffix },
    ])
    await upsertRssFeedItemCategories([{ rss_feed_item_id: item!.id, categories: [slug] }])
    const topic = await createTestTopic({ slug, name: slug })

    const result = await processBackfillCategoriesForTopicAliases({ topicId: topic.id })
    expect(result).toMatchObject({ updated: 1, hasMore: true })
    expect(result.cursor).not.toBeNull()

    const jobs = await rssFeedMaintenance.searchJobs({
      name: 'processBackfillCategoriesForTopicAliases',
      data: { topicId: topic.id },
    })
    onTestFinished(async () => {
      await Promise.all(jobs.map(job => job.remove()))
    })
    expect(jobs).toHaveLength(1)
    expect(jobs[0]!.data).toEqual({ topicId: topic.id, cursor: result.cursor })
    expect(
      (await getTestRssFeedItemCategories(item!.id)).find(row => row.category_text === slug)
        ?.topic_id,
    ).toBe(topic.id)
  })

  it('backfills RSS feed categories for a newly created topic', async () => {
    const slug = `feed-${randomUUID()}`
    const feed = await insertTestRssFeedDirect({})
    await upsertRssFeedCategories(feed.id, [slug])
    const topic = await createTestTopic({ slug, name: slug })

    const result = await processBackfillRssFeedCategoriesForTopicAlias({ topicId: topic.id })
    expect(result).toMatchObject({ updated: 1, hasMore: true })
    expect(result.cursor).not.toBeNull()

    const jobs = await rssFeedMaintenance.searchJobs({
      name: 'processBackfillRssFeedCategoriesForTopicAlias',
      data: { topicId: topic.id },
    })
    onTestFinished(async () => {
      await Promise.all(jobs.map(job => job.remove()))
    })
    expect(jobs.map(job => job.data)).toEqual([{ topicId: topic.id, cursor: result.cursor }])
    expect(
      (await getRssFeedCategories(feed.id)).find(row => row.category_text === slug)?.topic_id,
    ).toBe(topic.id)
  })

  it('does not enqueue a continuation after a partial snapshot batch', async () => {
    const suffix = randomUUID()
    const item = await insertSnapshotItem(suffix, `snapshot-${suffix}`)
    expect(await getTestRssFeedItemCategorySnapshotReconciliation(item.id)).toBeDefined()

    await expect(
      processReconcileRssFeedItemCategorySnapshots({ rssFeedItemIds: [item.id] }),
    ).resolves.toEqual({ reconciled: 1 })

    expect(await getTestRssFeedItemCategorySnapshotReconciliation(item.id)).toBeUndefined()
    await expect(ownedSnapshotJobs(item.id)).resolves.toEqual([])
  })

  it('enqueues an immediate serialized continuation after a full snapshot batch', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(rssFeedItemsWorkConfig, {
        category_snapshot_reconciliation_batch_size: 1,
      }),
    )
    const suffix = randomUUID()
    const item = await insertSnapshotItem(suffix, `snapshot-${suffix}`)

    await expect(
      processReconcileRssFeedItemCategorySnapshots({ rssFeedItemIds: [item.id] }),
    ).resolves.toEqual({ reconciled: 1 })

    const jobs = await ownedSnapshotJobs(item.id)
    onTestFinished(async () => {
      await Promise.all(jobs.map(job => job.remove()))
    })
    expect(jobs).toHaveLength(1)
    expect(jobs[0]!.data).toEqual({ rssFeedItemIds: [item.id] })
  })

  it('rejects when a full-batch continuation cannot be dispatched', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(rssFeedItemsWorkConfig, {
        category_snapshot_reconciliation_batch_size: 1,
      }),
    )
    const suffix = randomUUID()
    const item = await insertSnapshotItem(suffix, `snapshot-${suffix}`)
    const enqueueError = new Error(`continuation unavailable ${suffix}`)
    const originalAdd = rssFeedMaintenance.add
    const addSpy = vi
      .spyOn(rssFeedMaintenance, 'add')
      .mockImplementation((name, data, opts) =>
        name === 'processReconcileRssFeedItemCategorySnapshots' &&
        (data as { rssFeedItemIds?: string[] }).rssFeedItemIds?.includes(item.id)
          ? Promise.reject(enqueueError)
          : originalAdd.call(rssFeedMaintenance, name, data, opts),
      )
    onTestFinished(() => addSpy.mockRestore())

    await expect(
      processReconcileRssFeedItemCategorySnapshots({ rssFeedItemIds: [item.id] }),
    ).rejects.toBe(enqueueError)
  })
})
