import { readOwnedRssCategorySourceUnion } from '@voucha/test-helpers/rss-category-source-union'
import { normalizeRssFeedItemCategories, rssFeedItemIngestionConfig } from './processing-limits.mts'
import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  getTestRssFeedItemCategoryProjectionResult,
  getTestRssFeedItemCategorySnapshotReconciliation,
  insertTestRssFeedDirect,
  insertUnmappedRssFeedItemCategory,
} from '@voucha/test-helpers'
import { getTestRssFeedItemCategories } from '@voucha/test-helpers/entities/rss-feed-item-categories'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { rssFeedItemsWorkConfig } from './work-limits.mts'
import { upsertRssFeedItems } from './upsert.mts'
import { reconcileRssFeedItemCategorySnapshots } from './category-snapshot-reconciliations.mts'
import { reconcileRssFeedItemCategorySourcePage } from './category-source-pages.mts'
import { getRssFeedItemCategorySnapshotPage } from './source-category-union.mts'

function input(token: string, categories: string[]) {
  return { guid: token, title: token, link: `https://${token}.example.com/item`, categories }
}

describe('RSS category source and stale-category pages', () => {
  it('retains the exact generation until every source and stale category page finishes', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(rssFeedItemsWorkConfig, {
        category_snapshot_reconciliation_batch_size: 1,
        category_clear_batch_size: 1,
      }),
    )
    const token = `source-page-${randomUUID()}`
    const first = await insertTestRssFeedDirect({
      rssFeedUrl: `https://${token}.example.com/a.xml`,
    })
    const second = await insertTestRssFeedDirect({
      rssFeedUrl: `https://${token}.example.com/b.xml`,
    })
    const [item, excluded] = await upsertRssFeedItems(first.id, [
      input(token, []),
      input(`${token}-excluded`, []),
    ])
    await upsertRssFeedItems(second.id, [input(token, [])])
    await insertUnmappedRssFeedItemCategory(item!.id, `${token}-stale-a`)
    await insertUnmappedRssFeedItemCategory(item!.id, `${token}-stale-b`)
    const pending = await getTestRssFeedItemCategorySnapshotReconciliation(item!.id)
    const result = await reconcileRssFeedItemCategorySnapshots(1, [item!.id])
    expect(result.reconciled).toBe(0)
    expect(result.sourcePages).toHaveLength(1)
    await expect(getTestRssFeedItemCategoryProjectionResult(item!.id)).resolves.toBeUndefined()
    const source = await reconcileRssFeedItemCategorySourcePage(result.sourcePages![0]!)
    expect(source.sourcePages?.[0]?.afterFeedId).not.toBeNull()
    const deletion = await reconcileRssFeedItemCategorySourcePage(source.sourcePages![0]!)
    expect(deletion.sourcePages?.[0]?.phase).toBe('project')
    expect(await getTestRssFeedItemCategories(item!.id)).toHaveLength(1)
    await expect(getTestRssFeedItemCategorySnapshotReconciliation(item!.id)).resolves.toMatchObject(
      { change_id: pending!.change_id },
    )
    const finalDeletion = await reconcileRssFeedItemCategorySourcePage(deletion.sourcePages![0]!)
    expect(await getTestRssFeedItemCategories(item!.id)).toEqual([])
    await expect(getTestRssFeedItemCategoryProjectionResult(item!.id)).resolves.toBeUndefined()
    const complete = await reconcileRssFeedItemCategorySourcePage(finalDeletion.sourcePages![0]!)
    expect(complete).toEqual({ reconciled: 1 })
    await expect(
      getTestRssFeedItemCategorySnapshotReconciliation(item!.id),
    ).resolves.toBeUndefined()
    await expect(getTestRssFeedItemCategoryProjectionResult(item!.id)).resolves.toMatchObject({
      change_id: pending!.change_id,
      categories: [],
    })
    await expect(
      getTestRssFeedItemCategorySnapshotReconciliation(excluded!.id),
    ).resolves.toBeDefined()
    await expect(
      reconcileRssFeedItemCategorySourcePage(finalDeletion.sourcePages![0]!),
    ).resolves.toEqual({ reconciled: 1 })
  })

  it('discards an old source cursor after a new generation and keeps the complete ordered union', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(rssFeedItemsWorkConfig, {
        category_snapshot_reconciliation_batch_size: 1,
      }),
    )
    const token = `source-generation-${randomUUID()}`
    const first = await insertTestRssFeedDirect({
      rssFeedUrl: `https://${token}.example.com/a.xml`,
    })
    const second = await insertTestRssFeedDirect({
      rssFeedUrl: `https://${token}.example.com/b.xml`,
    })
    const [item] = await upsertRssFeedItems(first.id, [input(token, [`z-${token}`])])
    await upsertRssFeedItems(second.id, [input(token, [`a-${token}`])])
    const initial = await reconcileRssFeedItemCategorySnapshots(1, [item!.id])
    const scanned = await reconcileRssFeedItemCategorySourcePage(initial.sourcePages![0]!)
    await upsertRssFeedItems(first.id, [input(token, [`m-${token}`])])
    await expect(reconcileRssFeedItemCategorySourcePage(scanned.sourcePages![0]!)).resolves.toEqual(
      { reconciled: 1 },
    )
    const restarted = await reconcileRssFeedItemCategorySnapshots(1, [item!.id])
    const resumed = await reconcileRssFeedItemCategorySourcePage(restarted.sourcePages![0]!)
    await expect(reconcileRssFeedItemCategorySourcePage(resumed.sourcePages![0]!)).resolves.toEqual(
      { reconciled: 1 },
    )
    expect(
      (await getTestRssFeedItemCategories(item!.id)).map(row => row.category_text).toSorted(),
    ).toEqual([`a-${token}`, `m-${token}`])
    await expect(getRssFeedItemCategorySnapshotPage(randomUUID(), null)).resolves.toEqual({
      categories: [],
      afterFeedId: null,
    })
  })
  it('keeps the hard-capped collated source union when category admission is lowered', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(rssFeedItemsWorkConfig, {
        category_snapshot_reconciliation_batch_size: 1,
      }),
    )
    const token = `source-collation-${randomUUID()}`
    const first = await insertTestRssFeedDirect({
      rssFeedUrl: `https://${token}.example.com/a.xml`,
    })
    const second = await insertTestRssFeedDirect({
      rssFeedUrl: `https://${token}.example.com/b.xml`,
    })
    const earlier = Array.from(
      { length: 20 },
      (_, i) => `z-${i.toString().padStart(2, '0')}-${token}`,
    )
    const later = [
      earlier[0]!.toUpperCase(),
      ...Array.from({ length: 19 }, (_, i) => `a-${i.toString().padStart(2, '0')}-${token}`),
    ]
    const [item] = await upsertRssFeedItems(first.id, [input(token, earlier)])
    await upsertRssFeedItems(second.id, [input(token, later)])
    const expected = normalizeRssFeedItemCategories(
      await readOwnedRssCategorySourceUnion(item!.id, [first.id, second.id]),
    )
    expect(expected).toHaveLength(20)
    await rssFeedItemIngestionConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(rssFeedItemIngestionConfig, { item_max_categories: 1 }),
    )
    const page = await getRssFeedItemCategorySnapshotPage(item!.id, null)
    expect(page.afterFeedId).not.toBeNull()
    expect(page.categories).toEqual(earlier)
    const final = await getRssFeedItemCategorySnapshotPage(
      item!.id,
      page.afterFeedId,
      page.categories,
    )
    expect(final).toEqual({ categories: expected, afterFeedId: null })
    const pending = await reconcileRssFeedItemCategorySnapshots(1, [item!.id])
    const continued = await reconcileRssFeedItemCategorySourcePage(pending.sourcePages![0]!)
    await expect(
      reconcileRssFeedItemCategorySourcePage(continued.sourcePages![0]!),
    ).resolves.toEqual({ reconciled: 1 })
    await expect(getTestRssFeedItemCategoryProjectionResult(item!.id)).resolves.toMatchObject({
      categories: [expected[0]],
    })
  })
})
