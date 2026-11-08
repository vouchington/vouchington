import { getTestRssFeedItemCategories } from '@voucha/test-helpers/entities/rss-feed-item-categories'
import {
  getTestRssFeedItemCategoryProjectionResult,
  getTestRssFeedItemCategorySnapshotReconciliation,
  insertTestRssFeedDirect,
  withHeldCategoryProjectionResultForTest,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import { applyRssFeedItemCategorySnapshots } from '../category-projection-result.mts'
import { reconcileRssFeedItemCategorySnapshots } from '../category-snapshot-reconciliations.mts'
import { insertMissingHashtagAliases } from '../categories-chunks.mts'
import { upsertRssFeedItems } from '../upsert.mts'
import { upsertRssFeedItemCategories } from '../categories.mts'

function itemInput(suffix: string, categories: string[], title = 'Initial title') {
  return {
    categories,
    guid: `category-result-${suffix}`,
    link: `https://category-result-${suffix}.example.com/item`,
    title,
  }
}

async function reconcileOwned(rssFeedItemId: string) {
  return reconcileRssFeedItemCategorySnapshots(undefined, [rssFeedItemId])
}

describe('RSS category projection completion result', () => {
  it('reuses completed projections only while the exact notification identity is pending', async () => {
    const suffix = crypto.randomUUID()
    const feed = await insertTestRssFeedDirect({})
    const category = `replay-${suffix}`
    const [item] = await upsertRssFeedItems(feed.id, [itemInput(suffix, [category])])
    const pending = await getTestRssFeedItemCategorySnapshotReconciliation(item!.id)
    expect(pending).toBeDefined()
    const snapshot = { rss_feed_item_id: item!.id, categories: [category] }
    const selected = { ...snapshot, change_id: pending!.change_id, generation: pending!.generation }
    await expect(upsertRssFeedItemCategories([snapshot], selected)).resolves.toBe(true)
    const completed = await getTestRssFeedItemCategoryProjectionResult(item!.id)
    expect(completed).toMatchObject({ change_id: selected.change_id, categories: [category] })
    const rejectReapplication = async () => {
      throw new Error('A completed snapshot must not be projected again')
    }
    await expect(
      applyRssFeedItemCategorySnapshots([snapshot], rejectReapplication, selected),
    ).resolves.toBe(true)
    await expect(getTestRssFeedItemCategoryProjectionResult(item!.id)).resolves.toEqual(completed)

    const nextCategory = `next-${suffix}`
    await upsertRssFeedItems(feed.id, [itemInput(suffix, [nextCategory], 'Updated title')])
    await expect(
      applyRssFeedItemCategorySnapshots([snapshot], rejectReapplication, selected),
    ).resolves.toBe(false)
    await expect(getTestRssFeedItemCategoryProjectionResult(item!.id)).resolves.toEqual(completed)
    await expect(reconcileOwned(item!.id)).resolves.toEqual({ reconciled: 1 })
    await expect(getTestRssFeedItemCategories(item!.id)).resolves.toEqual([
      expect.objectContaining({ category_text: nextCategory }),
    ])
  })

  it('completes overlapping multi-item snapshots supplied in opposite orders', async () => {
    const suffix = crypto.randomUUID()
    const feed = await insertTestRssFeedDirect({})
    const items = await upsertRssFeedItems(feed.id, [
      itemInput(`a-${suffix}`, []),
      itemInput(`b-${suffix}`, []),
    ])
    const firstId = items[0]!.id
    const secondId = items[1]!.id
    const firstCategory = `a-${suffix}`
    const secondCategory = `b-${suffix}`
    await Promise.all([
      upsertRssFeedItemCategories([
        { rss_feed_item_id: firstId, categories: [firstCategory] },
        { rss_feed_item_id: secondId, categories: [firstCategory] },
      ]),
      upsertRssFeedItemCategories([
        { rss_feed_item_id: secondId, categories: [secondCategory] },
        { rss_feed_item_id: firstId, categories: [secondCategory] },
      ]),
    ])
    const [first, second] = await Promise.all([
      getTestRssFeedItemCategoryProjectionResult(firstId),
      getTestRssFeedItemCategoryProjectionResult(secondId),
    ])
    expect([firstCategory, secondCategory]).toContain(first?.categories[0])
    expect(second?.categories).toEqual(first?.categories)
    await expect(getTestRssFeedItemCategories(firstId)).resolves.toEqual([
      expect.objectContaining({ category_text: first!.categories[0] }),
    ])
    await expect(getTestRssFeedItemCategories(secondId)).resolves.toEqual([
      expect.objectContaining({ category_text: first!.categories[0] }),
    ])
  })

  it('rechecks exact pending identity after a result-row wait before reading source categories', async () => {
    const suffix = crypto.randomUUID()
    const feed = await insertTestRssFeedDirect({})
    const [item] = await upsertRssFeedItems(feed.id, [itemInput(suffix, [`first-${suffix}`])])
    await reconcileOwned(item!.id)
    const firstResult = await getTestRssFeedItemCategoryProjectionResult(item!.id)
    expect(firstResult?.categories).toEqual([`first-${suffix}`])

    await upsertRssFeedItems(feed.id, [itemInput(suffix, [`second-${suffix}`], 'Second title')])
    const selected = await getTestRssFeedItemCategorySnapshotReconciliation(item!.id)
    expect(selected).toBeDefined()
    const selectedAttempt = withHeldCategoryProjectionResultForTest(
      item!.id,
      () => reconcileOwned(item!.id),
      async () => {
        await upsertRssFeedItems(feed.id, [itemInput(suffix, [`third-${suffix}`], 'Third title')])
      },
    )
    await expect(selectedAttempt).resolves.toEqual({ reconciled: 1 })
    const latest = await getTestRssFeedItemCategorySnapshotReconciliation(item!.id)
    expect(latest).toMatchObject({ generation: '2' })
    expect(latest?.change_id).not.toBe(selected?.change_id)
    expect(await getTestRssFeedItemCategoryProjectionResult(item!.id)).toMatchObject({
      change_id: firstResult!.change_id,
      categories: firstResult!.categories,
    })

    await expect(reconcileOwned(item!.id)).resolves.toEqual({ reconciled: 1 })
    await expect(getTestRssFeedItemCategories(item!.id)).resolves.toEqual([
      expect.objectContaining({ category_text: `third-${suffix}` }),
    ])
    await expect(getTestRssFeedItemCategoryProjectionResult(item!.id)).resolves.toMatchObject({
      change_id: latest!.change_id,
      categories: [`third-${suffix}`],
    })
    await expect(
      getTestRssFeedItemCategorySnapshotReconciliation(item!.id),
    ).resolves.toBeUndefined()
  })

  it('rolls back the completion result after an independent write fails and retains pending work', async () => {
    const suffix = crypto.randomUUID()
    const feed = await insertTestRssFeedDirect({})
    const category = `pending-${suffix}`
    const [item] = await upsertRssFeedItems(feed.id, [itemInput(suffix, [category])])
    const pending = await getTestRssFeedItemCategorySnapshotReconciliation(item!.id)
    expect(pending).toBeDefined()
    const snapshot = { rss_feed_item_id: item!.id, categories: [category] }

    await expect(
      applyRssFeedItemCategorySnapshots(
        [snapshot],
        async () => {
          await insertMissingHashtagAliases([`partial-${suffix}`])
          throw new Error('owned category projection failure')
        },
        { ...snapshot, change_id: pending!.change_id, generation: pending!.generation },
      ),
    ).rejects.toThrow('owned category projection failure')
    await expect(getTestRssFeedItemCategoryProjectionResult(item!.id)).resolves.toBeUndefined()
    await expect(getTestRssFeedItemCategorySnapshotReconciliation(item!.id)).resolves.toMatchObject(
      {
        change_id: pending!.change_id,
      },
    )

    await expect(reconcileOwned(item!.id)).resolves.toEqual({ reconciled: 1 })
    await expect(getTestRssFeedItemCategoryProjectionResult(item!.id)).resolves.toMatchObject({
      change_id: pending!.change_id,
      categories: [category],
    })
  })
})
