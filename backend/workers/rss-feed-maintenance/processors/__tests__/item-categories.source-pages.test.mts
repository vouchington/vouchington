import { markRssFeedItemCategorySnapshotsForReconciliation } from '@services/rss-feed-items/category-snapshot-reconciliations'
import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  beginTransaction,
  insertTestRssFeedDirect,
  getTestRssFeedItemCategorySnapshotReconciliation,
  getTestRssFeedItemCategoryProjectionResult,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  reconcileOwnedRssCategorySnapshotBatch,
  captureRssCategoryPageJobs,
} from '@voucha/test-helpers/rss-category-page-jobs'
import { rssFeedItemsWorkConfig } from '@services/rss-feed-items/work-limits'
import { upsertRssFeedItems } from '@services/rss-feed-items/upsert'
import { processReconcileRssFeedItemCategorySnapshots } from '../item-categories.mts'

describe('RSS source continuation recovery', () => {
  it('keeps duplicate source chains idempotent and leaves the next parent reachable by recovery', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(rssFeedItemsWorkConfig, {
        category_snapshot_reconciliation_batch_size: 1,
      }),
    )
    const token = `source-interleave-${randomUUID()}`
    const first = await insertTestRssFeedDirect({
      rssFeedUrl: `https://${token}.example.com/a.xml`,
    })
    const second = await insertTestRssFeedDirect({
      rssFeedUrl: `https://${token}.example.com/b.xml`,
    })
    const input = (guid: string) => ({
      guid,
      title: guid,
      link: `https://${token}.example.com/${guid}`,
      categories: [],
    })
    const [item] = await upsertRssFeedItems(first.id, [input(token)])
    await upsertRssFeedItems(second.id, [input(token)])
    const [next, excluded] = await upsertRssFeedItems(first.id, [
      input(`${token}-next`),
      input(`${token}-excluded`),
    ])
    const itemIds = [item!.id, next!.id]
    const firstPass = await captureRssCategoryPageJobs(itemIds, () =>
      processReconcileRssFeedItemCategorySnapshots({ rssFeedItemIds: itemIds }),
    )
    expect(firstPass.jobs).toHaveLength(2)
    const firstSource = firstPass.jobs.find(job => job.sourcePage)!
    const nextParent = firstPass.jobs.find(job => job.after)!
    expect(firstSource.sourcePage?.rssFeedItemId).toBe(item!.id)
    expect(nextParent.after?.rssFeedItemId).toBe(item!.id)
    const recovery = await captureRssCategoryPageJobs(itemIds, () =>
      processReconcileRssFeedItemCategorySnapshots({ rssFeedItemIds: itemIds }),
    )
    expect(recovery.jobs).toEqual(firstPass.jobs)
    const nextDiscovery = await captureRssCategoryPageJobs(itemIds, () =>
      processReconcileRssFeedItemCategorySnapshots(nextParent),
    )
    await expect(getTestRssFeedItemCategorySnapshotReconciliation(next!.id)).resolves.toBeDefined()
    await captureRssCategoryPageJobs(itemIds, () =>
      processReconcileRssFeedItemCategorySnapshots(
        nextDiscovery.jobs.find(job => job.sourcePage?.rssFeedItemId === next!.id)!,
      ),
    )
    await expect(
      getTestRssFeedItemCategorySnapshotReconciliation(next!.id),
    ).resolves.toBeUndefined()
    const pending = await getTestRssFeedItemCategorySnapshotReconciliation(item!.id)
    expect(pending).toBeDefined()
    const firstPage = await captureRssCategoryPageJobs(itemIds, () =>
      processReconcileRssFeedItemCategorySnapshots(firstSource),
    )
    const replayPage = await captureRssCategoryPageJobs(itemIds, () =>
      processReconcileRssFeedItemCategorySnapshots(recovery.jobs.find(job => job.sourcePage)!),
    )
    expect(replayPage.jobs).toEqual(firstPage.jobs)
    const duplicateCompletion = await captureRssCategoryPageJobs(itemIds, () =>
      Promise.all([
        processReconcileRssFeedItemCategorySnapshots(firstPage.jobs[0]!),
        processReconcileRssFeedItemCategorySnapshots(replayPage.jobs[0]!),
      ]),
    )
    expect(duplicateCompletion.jobs).toEqual([])
    await expect(
      getTestRssFeedItemCategorySnapshotReconciliation(item!.id),
    ).resolves.toBeUndefined()
    await expect(getTestRssFeedItemCategoryProjectionResult(item!.id)).resolves.toMatchObject({
      change_id: pending!.change_id,
    })
    await captureRssCategoryPageJobs(itemIds, () =>
      processReconcileRssFeedItemCategorySnapshots({ rssFeedItemIds: itemIds }),
    )
    await expect(
      getTestRssFeedItemCategorySnapshotReconciliation(next!.id),
    ).resolves.toBeUndefined()
    await expect(
      getTestRssFeedItemCategorySnapshotReconciliation(excluded!.id),
    ).resolves.toBeDefined()
  })
  it('finds a writer committed behind an advanced cursor on the next root recovery scan', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(rssFeedItemsWorkConfig, {
        category_snapshot_reconciliation_batch_size: 1,
      }),
    )
    const token = `source-late-commit-${randomUUID()}`
    const feed = await insertTestRssFeedDirect({})
    const input = (guid: string) => ({
      guid,
      title: guid,
      link: `https://${token}.example.com/${guid}`,
      categories: [],
    })
    const [late] = await upsertRssFeedItems(feed.id, [input(`${token}-late`)])
    await reconcileOwnedRssCategorySnapshotBatch([late!.id])
    await using writer = await beginTransaction()
    await markRssFeedItemCategorySnapshotsForReconciliation(writer, [late!.id])
    const [current] = await upsertRssFeedItems(feed.id, [input(`${token}-current`)])
    const itemIds = [late!.id, current!.id]
    const advanced = await captureRssCategoryPageJobs(itemIds, () =>
      processReconcileRssFeedItemCategorySnapshots({ rssFeedItemIds: itemIds }),
    )
    const afterCurrent = advanced.jobs.find(job => job.after)!
    expect(afterCurrent.after?.rssFeedItemId).toBe(current!.id)
    await captureRssCategoryPageJobs(itemIds, () =>
      processReconcileRssFeedItemCategorySnapshots(
        advanced.jobs.find(job => job.sourcePage?.rssFeedItemId === current!.id)!,
      ),
    )
    await writer.commit()
    const behind = await captureRssCategoryPageJobs(itemIds, () =>
      processReconcileRssFeedItemCategorySnapshots(afterCurrent),
    )
    expect(behind.result).toEqual({ reconciled: 0 })
    await expect(getTestRssFeedItemCategorySnapshotReconciliation(late!.id)).resolves.toBeDefined()
    await reconcileOwnedRssCategorySnapshotBatch(itemIds)
    await expect(
      getTestRssFeedItemCategorySnapshotReconciliation(late!.id),
    ).resolves.toBeUndefined()
  })
})
