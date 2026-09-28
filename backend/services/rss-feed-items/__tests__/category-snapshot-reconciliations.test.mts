import { describe, expect, it } from 'vitest'
import { notifications } from '@queues/notifications/queues'
import {
  createTestTopicAliasForCategoryMapping,
  getTestRssFeedItemCategorySnapshotReconciliation,
  getTestPostPublicationDirtyWorkForScope,
  insertTestRssFeedDirect,
  listTestRssFeedItemCategorySnapshotReconciliations,
  replaceTestRssFeedItemCategorySnapshotReconciliation,
} from '@voucha/test-helpers'
import {
  acknowledgeRssFeedItemCategorySnapshot,
  CATEGORY_SNAPSHOT_RECONCILIATION_BATCH_SIZE,
  reconcileRssFeedItemCategorySnapshotRows,
  type RssFeedItemCategorySnapshotReconciliation,
} from '../category-snapshot-reconciliations.mts'
import { getRssFeedItemCategories } from '../categories.mts'
import { upsertRssFeedItems } from '../upsert.mts'

function itemInput(suffix: string, categories: string[], title = 'Initial title') {
  return {
    categories,
    guid: `category-snapshot-${suffix}`,
    link: `https://category-snapshot-${suffix}.example.com/item`,
    title,
  }
}

async function reconcileOwned(rssFeedItemIds: string[]) {
  const rows = await listTestRssFeedItemCategorySnapshotReconciliations(rssFeedItemIds)
  return reconcileRssFeedItemCategorySnapshotRows(
    rows as RssFeedItemCategorySnapshotReconciliation[],
  )
}

describe('RSS feed item category snapshot reconciliation', () => {
  it('recovers the committed desired snapshot when the post-commit prompt is absent', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const feed = await insertTestRssFeedDirect({})
    const category = `lost-prompt-${suffix}`
    const [item] = await upsertRssFeedItems(feed.id, [itemInput(suffix, [category])])

    await expect(getTestRssFeedItemCategorySnapshotReconciliation(item!.id)).resolves.toMatchObject(
      { categories: [category], generation: '1' },
    )

    await expect(reconcileOwned([item!.id])).resolves.toEqual({ reconciled: 1 })
    await expect(getRssFeedItemCategories(item!.id)).resolves.toEqual([
      expect.objectContaining({ category_text: category }),
    ])
    await expect
      .poll(async () => {
        const jobs = await notifications.getJobs('waiting')
        return jobs.some(
          job =>
            job.name === 'processReconcileRssFeedItemNotifications' &&
            (job.data as { rssFeedItemId?: string }).rssFeedItemId === item!.id,
        )
      })
      .toBe(true)
    await expect(
      getTestRssFeedItemCategorySnapshotReconciliation(item!.id),
    ).resolves.toBeUndefined()
  })

  it('persists and applies an empty snapshot', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const feed = await insertTestRssFeedDirect({})
    const category = `removed-${suffix}`
    const [item] = await upsertRssFeedItems(feed.id, [itemInput(suffix, [category])])
    await reconcileOwned([item!.id])

    await upsertRssFeedItems(feed.id, [itemInput(suffix, [], 'Changed title')])
    await expect(getTestRssFeedItemCategorySnapshotReconciliation(item!.id)).resolves.toMatchObject(
      { categories: [] },
    )

    await reconcileOwned([item!.id])
    await expect(getRssFeedItemCategories(item!.id)).resolves.toEqual([])
  })

  it('captures an alias scope when removing an alias-only stale category', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const feed = await insertTestRssFeedDirect({})
    const alias = `alias-only-stale-${suffix}`
    const aliasId = await createTestTopicAliasForCategoryMapping({ alias })
    const [item] = await upsertRssFeedItems(feed.id, [itemInput(suffix, [alias])])

    await reconcileOwned([item!.id])
    const before = await getTestPostPublicationDirtyWorkForScope({
      type: 'topic_alias',
      id: aliasId,
    })
    expect(before).toBeDefined()

    await upsertRssFeedItems(feed.id, [itemInput(suffix, [], 'Removed alias category')])
    await reconcileOwned([item!.id])

    const after = await getTestPostPublicationDirtyWorkForScope({
      type: 'topic_alias',
      id: aliasId,
    })
    expect(after).toBeDefined()
    expect(Number(after!.generation)).toBeGreaterThan(Number(before!.generation))
    expect(after!.reasons).toContain('post_topics_changed')
  })

  it('persists categories when an unchanged item gains another feed source', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const hostname = `category-source-${suffix}.example.com`
    const firstFeed = await insertTestRssFeedDirect({
      rssFeedUrl: `https://${hostname}/first.xml`,
      topicHostname: `first-${hostname}`,
    })
    const secondFeed = await insertTestRssFeedDirect({
      rssFeedUrl: `https://${hostname}/second.xml`,
      topicHostname: `second-${hostname}`,
    })
    const input = itemInput(suffix, [`source-${suffix}`])
    const [item] = await upsertRssFeedItems(firstFeed.id, [input])
    await reconcileOwned([item!.id])

    await expect(upsertRssFeedItems(secondFeed.id, [input])).resolves.toEqual([])
    await expect(getTestRssFeedItemCategorySnapshotReconciliation(item!.id)).resolves.toMatchObject(
      { categories: input.categories },
    )
  })

  it('persists an unchanged new-source snapshot alongside changed items', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const hostname = `category-source-mixed-${suffix}.example.com`
    const [firstFeed, secondFeed] = await Promise.all([
      insertTestRssFeedDirect({
        rssFeedUrl: `https://${hostname}/first.xml`,
        topicHostname: `first-${hostname}`,
      }),
      insertTestRssFeedDirect({
        rssFeedUrl: `https://${hostname}/second.xml`,
        topicHostname: `second-${hostname}`,
      }),
    ])
    const unchangedInput = itemInput(suffix, [`unchanged-source-${suffix}`])
    const [unchangedItem] = await upsertRssFeedItems(firstFeed.id, [unchangedInput])
    await reconcileOwned([unchangedItem!.id])

    const upserted = await upsertRssFeedItems(secondFeed.id, [
      unchangedInput,
      itemInput(`${suffix}-changed`, [`changed-source-${suffix}`]),
    ])
    expect(upserted).toHaveLength(2)

    await expect(
      getTestRssFeedItemCategorySnapshotReconciliation(unchangedItem!.id),
    ).resolves.toMatchObject({ categories: unchangedInput.categories })
  })

  it('reconciles the union of category snapshots from every feed source', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const hostname = `category-union-${suffix}.example.com`
    const [firstFeed, secondFeed] = await Promise.all([
      insertTestRssFeedDirect({
        rssFeedUrl: `https://${hostname}/first.xml`,
        topicHostname: `first-${hostname}`,
      }),
      insertTestRssFeedDirect({
        rssFeedUrl: `https://${hostname}/second.xml`,
        topicHostname: `second-${hostname}`,
      }),
    ])
    const firstCategory = `first-source-${suffix}`
    const secondCategory = `second-source-${suffix}`
    const [item] = await upsertRssFeedItems(firstFeed.id, [itemInput(suffix, [firstCategory])])
    await reconcileOwned([item!.id])

    await upsertRssFeedItems(secondFeed.id, [itemInput(suffix, [secondCategory], 'Second source')])
    await reconcileOwned([item!.id])

    await expect(getRssFeedItemCategories(item!.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category_text: firstCategory }),
        expect.objectContaining({ category_text: secondCategory }),
      ]),
    )

    await upsertRssFeedItems(firstFeed.id, [itemInput(suffix, [], 'First source updated')])
    await reconcileOwned([item!.id])

    await expect(getRssFeedItemCategories(item!.id)).resolves.toEqual([
      expect.objectContaining({ category_text: secondCategory }),
    ])
  })

  it('does not let a stale acknowledgement delete a newer generation', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const feed = await insertTestRssFeedDirect({})
    const firstCategory = `first-${suffix}`
    const secondCategory = `second-${suffix}`
    const [item] = await upsertRssFeedItems(feed.id, [itemInput(suffix, [firstCategory])])
    const first = await getTestRssFeedItemCategorySnapshotReconciliation(item!.id)

    await upsertRssFeedItems(feed.id, [itemInput(suffix, [secondCategory], 'Changed title')])
    const second = await getTestRssFeedItemCategorySnapshotReconciliation(item!.id)
    expect(Number(second!.generation)).toBe(Number(first!.generation) + 1)

    await acknowledgeRssFeedItemCategorySnapshot({
      rss_feed_item_id: item!.id,
      categories: first!.categories as string[],
      generation: first!.generation,
    })
    await expect(getTestRssFeedItemCategorySnapshotReconciliation(item!.id)).resolves.toMatchObject(
      { categories: [secondCategory], generation: second!.generation },
    )

    await reconcileOwned([item!.id])
    await expect(getRssFeedItemCategories(item!.id)).resolves.toEqual([
      expect.objectContaining({ category_text: secondCategory }),
    ])
  })

  it('drains only the oldest bounded batch', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const feed = await insertTestRssFeedDirect({})
    const inputs = Array.from({ length: 26 }, (_, index) => itemInput(`${suffix}-${index}`, []))
    const items = await upsertRssFeedItems(feed.id, inputs)
    const itemIds = items.map(item => item.id)
    const ordered = await listTestRssFeedItemCategorySnapshotReconciliations(itemIds)
    expect(ordered).toHaveLength(26)

    expect(CATEGORY_SNAPSHOT_RECONCILIATION_BATCH_SIZE).toBe(25)
    await expect(
      reconcileRssFeedItemCategorySnapshotRows(
        ordered.slice(
          0,
          CATEGORY_SNAPSHOT_RECONCILIATION_BATCH_SIZE,
        ) as RssFeedItemCategorySnapshotReconciliation[],
      ),
    ).resolves.toEqual({ reconciled: 25 })
    await expect(listTestRssFeedItemCategorySnapshotReconciliations(itemIds)).resolves.toEqual([
      expect.objectContaining({ rss_feed_item_id: ordered[25]!.rss_feed_item_id }),
    ])
  })

  it('retains failed work without starving another selected snapshot', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const feed = await insertTestRssFeedDirect({})
    const [poisoned, valid] = await upsertRssFeedItems(feed.id, [
      itemInput(`${suffix}-poisoned`, []),
      itemInput(`${suffix}-valid`, []),
    ])
    await replaceTestRssFeedItemCategorySnapshotReconciliation(poisoned!.id, [1])

    const selected = await listTestRssFeedItemCategorySnapshotReconciliations([
      poisoned!.id,
      valid!.id,
    ])
    await expect(
      reconcileRssFeedItemCategorySnapshotRows(
        selected as RssFeedItemCategorySnapshotReconciliation[],
      ),
    ).rejects.toThrow('RSS feed item category snapshot reconciliation failed')
    await expect(
      getTestRssFeedItemCategorySnapshotReconciliation(poisoned!.id),
    ).resolves.toBeDefined()
    await expect(
      getTestRssFeedItemCategorySnapshotReconciliation(valid!.id),
    ).resolves.toBeUndefined()
  })
})
