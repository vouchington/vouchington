import { SITEMAP_CONFIG } from '@voucha/config/sitemaps'
import type { TrackedDayRange } from '@services/sitemaps/types'
import { getMonthlyBackfillPage } from '@services/sitemaps/backfill-utils'
import { getTrackedDayRange } from '@services/sitemaps/storage'
import { getSitemapsWorkLimit } from '@services/sitemaps/work-limits'
import type {
  enqueueBulkUpdatePostDaySitemaps,
  enqueueMonthlyBackfillArchiveContinuation,
} from '@queues/sitemaps/enqueues'

export type ArchiveBackfillDependencies = {
  enqueueBulkUpdatePostDaySitemaps: typeof enqueueBulkUpdatePostDaySitemaps
  enqueueMonthlyBackfillArchiveContinuation: typeof enqueueMonthlyBackfillArchiveContinuation
}

/**
 * One bounded page of the archive backfill: the next days after `afterDay`, then a continuation
 * from this page's last day, so the ever-growing archive never fans out in a single job.
 */
export async function runMonthlyBackfillArchivePage(
  afterDay: string | undefined,
  dependencies: ArchiveBackfillDependencies,
): Promise<{ enqueued: number; hasMore: boolean }> {
  const trackedRange = (await getTrackedDayRange()) as TrackedDayRange | null
  const page = getMonthlyBackfillPage(new Date(), trackedRange, SITEMAP_CONFIG.POST_TYPES, {
    afterDay,
    pageDays: getSitemapsWorkLimit('archive_backfill_day_page_size'),
  })
  if (page.entries.length > 0) await dependencies.enqueueBulkUpdatePostDaySitemaps(page.entries)
  if (page.hasMore && page.lastDay) {
    await dependencies.enqueueMonthlyBackfillArchiveContinuation(page.lastDay)
  }
  return { enqueued: page.entries.length, hasMore: page.hasMore }
}
