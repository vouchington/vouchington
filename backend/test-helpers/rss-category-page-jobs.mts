import { runBoundedPages } from '../modules/utils/run-bounded-pages.mts'
import { processReconcileRssFeedItemCategorySnapshots } from '../workers/rss-feed-maintenance/processors/item-categories.mts'
import { rssFeedMaintenance } from '../queues/rss-feed-maintenance/queues.mts'
import type { RssFeedMaintenanceJobPayloads } from '../queues/rss-feed-maintenance/types.mts'

type SnapshotData = RssFeedMaintenanceJobPayloads['processReconcileRssFeedItemCategorySnapshots']

/** Observe and remove only admissions carrying this test's owned item identifiers. */
export async function captureRssCategoryPageJobs<Result>(
  itemIds: readonly string[],
  run: () => Promise<Result>,
): Promise<{ result: Result; jobs: SnapshotData[] }> {
  const owned = new Set(itemIds)
  const ids = new Set<string>()
  const onAdded = (job: { id: string; name: string; data: unknown }) => {
    const data = job.data as SnapshotData
    if (
      job.name === 'processReconcileRssFeedItemCategorySnapshots' &&
      (owned.has(data.sourcePage?.rssFeedItemId ?? '') ||
        data.rssFeedItemIds?.some(id => owned.has(id)))
    )
      ids.add(job.id)
  }
  rssFeedMaintenance.on('added', onAdded)
  try {
    const result = await run()
    const jobs = await Promise.all(
      [...ids].map(async id => {
        const job = await rssFeedMaintenance.getJob(id)
        if (!job) throw new Error(`Missing RSS category page job ${id}`)
        return job
      }),
    )
    await Promise.all(jobs.map(job => job.remove()))
    return { result, jobs: jobs.map(job => job.data as SnapshotData) }
  } finally {
    rssFeedMaintenance.off('added', onAdded)
  }
}

/** Execute the native source jobs selected by one owned parent batch, with a test-run job cap. */
export async function reconcileOwnedRssCategorySnapshotBatch(
  itemIds: readonly string[],
): Promise<{ reconciled: number }> {
  const initial = await captureRssCategoryPageJobs(itemIds, () =>
    processReconcileRssFeedItemCategorySnapshots({ rssFeedItemIds: [...itemIds] }),
  )
  const pending = initial.jobs.filter(job => job.sourcePage)
  const errors: unknown[] = []
  let reconciled = 0
  const result = await runBoundedPages({ batchSize: 1, maxBatches: 128 }, async () => {
    const job = pending.shift()
    if (!job) return 0
    try {
      const page = await captureRssCategoryPageJobs(itemIds, () =>
        processReconcileRssFeedItemCategorySnapshots(job),
      )
      reconciled += page.result.reconciled
      pending.push(...page.jobs.filter(next => next.sourcePage))
    } catch (err) {
      errors.push(err)
    }
    return pending.length ? 1 : 0
  })
  if (result.hasMore) throw new Error('Owned RSS category jobs exceeded the test-run cap')
  if (errors.length)
    throw new AggregateError(errors, 'RSS feed item category snapshot reconciliation failed')
  return { reconciled }
}
