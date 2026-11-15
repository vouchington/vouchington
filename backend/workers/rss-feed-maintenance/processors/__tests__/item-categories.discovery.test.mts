import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { rssFeedMaintenance } from '@queues/rss-feed-maintenance/queues'
import { upsertRssFeedItems } from '@services/rss-feed-items/upsert'
import { rssFeedItemsWorkConfig } from '@services/rss-feed-items/work-limits'
import {
  getTestRssFeedItemCategorySnapshotReconciliation,
  insertTestRssFeedDirect,
} from '@voucha/test-helpers'
import { captureRssCategoryPageJobs } from '@voucha/test-helpers/rss-category-page-jobs'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import type { RssFeedMaintenanceJobPayloads } from '@queues/rss-feed-maintenance/types'
import { processReconcileRssFeedItemCategorySnapshots } from '../item-categories.mts'

describe('RSS category parent discovery', () => {
  it('admits every selected source in one native bulk without acknowledging pending work', async () => {
    const token = randomUUID()
    const feed = await insertTestRssFeedDirect({})
    const items = await upsertRssFeedItems(
      feed.id,
      [0, 1].map(n => ({
        guid: `${token}-${n}`,
        title: token,
        link: `https://${token}.example.com/${n}`,
        categories: [],
      })),
    )
    const ids = items.map(item => item.id)
    const bulk = vi.spyOn(rssFeedMaintenance, 'addBulk')
    onTestFinished(() => bulk.mockRestore())
    const selected = await captureRssCategoryPageJobs(ids, () =>
      processReconcileRssFeedItemCategorySnapshots({ rssFeedItemIds: ids }),
    )
    expect(selected.result.reconciled).toBe(0)
    expect(
      selected.jobs
        .map(job => job.sourcePage!.rssFeedItemId)
        .toSorted((a, b) => a.localeCompare(b)),
    ).toEqual(ids.toSorted((a, b) => a.localeCompare(b)))
    const ownedCalls = bulk.mock.calls.filter(([jobs]) =>
      jobs.some(job =>
        ids.includes(
          (
            job.data as RssFeedMaintenanceJobPayloads['processReconcileRssFeedItemCategorySnapshots']
          ).sourcePage?.rssFeedItemId ?? '',
        ),
      ),
    )
    expect(ownedCalls).toHaveLength(1)
    expect(ownedCalls[0]![0]).toHaveLength(2)
    expect(
      await Promise.all(ids.map(id => getTestRssFeedItemCategorySnapshotReconciliation(id))),
    ).toEqual(ids.map(id => expect.objectContaining({ rss_feed_item_id: id })))
    const completed = await Promise.all(
      selected.jobs.map(job =>
        captureRssCategoryPageJobs(ids, () => processReconcileRssFeedItemCategorySnapshots(job)),
      ),
    )
    expect(completed.map(page => page.result.reconciled)).toEqual([1, 1])
    expect(
      await Promise.all(ids.map(id => getTestRssFeedItemCategorySnapshotReconciliation(id))),
    ).toEqual([undefined, undefined])
  })

  it('admits a parent cursor after a full batch and retains an accepted source when cursor admission fails', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(rssFeedItemsWorkConfig, {
        category_snapshot_reconciliation_batch_size: 1,
      }),
    )
    const token = randomUUID()
    const feed = await insertTestRssFeedDirect({})
    const [item] = await upsertRssFeedItems(feed.id, [
      { guid: token, title: token, link: `https://${token}.example.com/item`, categories: [] },
    ])
    const ids = [item!.id]
    const first = await captureRssCategoryPageJobs(ids, () =>
      processReconcileRssFeedItemCategorySnapshots({ rssFeedItemIds: ids }),
    )
    expect(first.jobs).toHaveLength(2)
    expect(first.jobs.find(job => job.after)).toMatchObject({
      rssFeedItemIds: ids,
      after: { rssFeedItemId: item!.id },
    })
    expect(await getTestRssFeedItemCategorySnapshotReconciliation(item!.id)).toBeDefined()
    const admissionError = new Error('Owned parent cursor unavailable')
    const realAdd = rssFeedMaintenance.add
    const fail = vi
      .spyOn(rssFeedMaintenance, 'add')
      .mockImplementation((name, data, opts) =>
        name === 'processReconcileRssFeedItemCategorySnapshots' &&
        (data as { rssFeedItemIds?: string[] }).rssFeedItemIds?.includes(item!.id)
          ? Promise.reject(admissionError)
          : realAdd.call(rssFeedMaintenance, name, data, opts),
      )
    let accepted
    try {
      accepted = await captureRssCategoryPageJobs(ids, async () => {
        await expect(
          processReconcileRssFeedItemCategorySnapshots({ rssFeedItemIds: ids }),
        ).rejects.toBe(admissionError)
      })
    } finally {
      fail.mockRestore()
    }
    expect(accepted.jobs).toHaveLength(1)
    expect(accepted.jobs[0]?.sourcePage?.rssFeedItemId).toBe(item!.id)
    await captureRssCategoryPageJobs(ids, () =>
      processReconcileRssFeedItemCategorySnapshots(accepted.jobs[0]!),
    )
    expect(await getTestRssFeedItemCategorySnapshotReconciliation(item!.id)).toBeUndefined()
  })
  it('retains a partial source bulk and recovers the missing parent without advancing its cursor', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(rssFeedItemsWorkConfig, {
        category_snapshot_reconciliation_batch_size: 2,
      }),
    )
    const token = randomUUID()
    const feed = await insertTestRssFeedDirect({})
    const items = await upsertRssFeedItems(
      feed.id,
      [0, 1, 2].map(n => ({
        guid: `${token}-${n}`,
        title: token,
        link: `https://${token}.example.com/${n}`,
        categories: [],
      })),
    )
    const ids = items.slice(0, 2).map(item => item.id)
    const excluded = items[2]!.id
    const admissionError = new Error('Owned partial source bulk unavailable')
    const realBulk = rssFeedMaintenance.addBulk
    const fail = vi.spyOn(rssFeedMaintenance, 'addBulk').mockImplementation(async jobs => {
      const owned = jobs.every(job =>
        ids.includes(
          (
            job.data as RssFeedMaintenanceJobPayloads['processReconcileRssFeedItemCategorySnapshots']
          ).sourcePage?.rssFeedItemId ?? '',
        ),
      )
      if (owned && jobs.length === 2) {
        await realBulk.call(rssFeedMaintenance, jobs.slice(0, 1))
        throw admissionError
      }
      return realBulk.call(rssFeedMaintenance, jobs)
    })
    let accepted
    try {
      accepted = await captureRssCategoryPageJobs(ids, async () => {
        await expect(
          processReconcileRssFeedItemCategorySnapshots({ rssFeedItemIds: ids }),
        ).rejects.toBe(admissionError)
      })
    } finally {
      fail.mockRestore()
    }
    expect(accepted.jobs).toHaveLength(1)
    expect(accepted.jobs.some(job => job.after)).toBe(false)
    expect(
      await Promise.all(ids.map(id => getTestRssFeedItemCategorySnapshotReconciliation(id))),
    ).toEqual(ids.map(id => expect.objectContaining({ rss_feed_item_id: id })))
    const firstId = accepted.jobs[0]!.sourcePage!.rssFeedItemId
    await captureRssCategoryPageJobs(ids, () =>
      processReconcileRssFeedItemCategorySnapshots(accepted.jobs[0]!),
    )
    expect(await getTestRssFeedItemCategorySnapshotReconciliation(firstId)).toBeUndefined()
    const missingId = ids.find(id => id !== firstId)!
    expect(await getTestRssFeedItemCategorySnapshotReconciliation(missingId)).toBeDefined()
    const recovery = await captureRssCategoryPageJobs(ids, () =>
      processReconcileRssFeedItemCategorySnapshots({ rssFeedItemIds: ids }),
    )
    expect(recovery.jobs).toHaveLength(1)
    expect(recovery.jobs[0]?.sourcePage?.rssFeedItemId).toBe(missingId)
    await captureRssCategoryPageJobs(ids, () =>
      processReconcileRssFeedItemCategorySnapshots(recovery.jobs[0]!),
    )
    expect(await getTestRssFeedItemCategorySnapshotReconciliation(missingId)).toBeUndefined()
    expect(await getTestRssFeedItemCategorySnapshotReconciliation(excluded)).toBeDefined()
  })
})
