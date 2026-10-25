import { processRetiredSitemapCleanup } from './processors/retired-cleanup.mts'
import { SITEMAP_CONFIG } from '@voucha/config/sitemaps'
import type { TrackedDayRange } from '@services/sitemaps/types'
import {
  getMonthlyBackfillPage,
  getNightlyBackfillEntries,
  getWeeklyBackfillEntries,
} from '@services/sitemaps/backfill-utils'
import { generateSitemapFamilyFiles } from '@services/sitemaps/family-generation'
import {
  generatePostDaySitemapFiles,
  generatePostTypeIndex,
  generatePostsIndex,
  generateRootIndex,
} from '@services/sitemaps/generation'
import { getTrackedDayRange } from '@services/sitemaps/storage'
import { getSitemapsWorkLimit } from '@services/sitemaps/work-limits'
import { cleanupRetiredSitemapGenerations } from '@services/sitemaps/retired-generation-cleanup'
import {
  enqueueBulkUpdatePostDaySitemaps,
  enqueueFamilySitemapContinuation,
  enqueueMonthlyBackfillArchiveContinuation,
  enqueuePostDaySitemapContinuation,
  enqueueRetiredSitemapCleanupContinuation,
  enqueueUpdateFamilySitemap,
  enqueueUpdatePostTypeIndex,
  enqueueUpdatePostsIndex,
  enqueueUpdateRootIndex,
} from '@queues/sitemaps/enqueues'
import { invalidate } from '@services/entity-cache/invalidate'

type UpdatePostDaySitemapDependencies = {
  generatePostDaySitemapFiles: typeof generatePostDaySitemapFiles
  enqueuePostDaySitemapContinuation: typeof enqueuePostDaySitemapContinuation
  enqueueUpdatePostTypeIndex: typeof enqueueUpdatePostTypeIndex
  enqueueUpdatePostsIndex: typeof enqueueUpdatePostsIndex
  enqueueUpdateRootIndex: typeof enqueueUpdateRootIndex
  invalidateSitemaps: typeof invalidate.sitemaps
}

/**
 * @public Retained provisionally under issue #1360; external production use is unconfirmed and this
 * export may be made private or removed after intended-use review.
 * Evidence: `docs/overview/architecture/queues/README.md`.
 */
export const updatePostDaySitemapDependencies: UpdatePostDaySitemapDependencies = {
  generatePostDaySitemapFiles,
  enqueuePostDaySitemapContinuation,
  enqueueUpdatePostTypeIndex,
  enqueueUpdatePostsIndex,
  enqueueUpdateRootIndex,
  invalidateSitemaps: invalidate.sitemaps,
}

type UpdateSitemapIndexDependencies = {
  generatePostTypeIndex: typeof generatePostTypeIndex
  generatePostsIndex: typeof generatePostsIndex
  generateSitemapFamilyFiles: typeof generateSitemapFamilyFiles
  enqueueFamilySitemapContinuation: typeof enqueueFamilySitemapContinuation
  generateRootIndex: typeof generateRootIndex
  enqueueUpdateRootIndex: typeof enqueueUpdateRootIndex
  invalidateSitemaps: typeof invalidate.sitemaps
}

/**
 * @public Retained provisionally under issue #1360; external production use is unconfirmed and this
 * export may be made private or removed after intended-use review. Evidence: `docs/overview/architecture/queues/README.md`.
 */
export const updateSitemapIndexDependencies: UpdateSitemapIndexDependencies = {
  generatePostTypeIndex,
  generatePostsIndex,
  generateSitemapFamilyFiles,
  enqueueFamilySitemapContinuation,
  generateRootIndex,
  enqueueUpdateRootIndex,
  invalidateSitemaps: invalidate.sitemaps,
}

/**
 * @public Retained provisionally under issue #1360; external production use is unconfirmed and this
 * export may be made private or removed after intended-use review.
 * Evidence: `docs/overview/architecture/queues/README.md`.
 */
export const backfillDispatcherDependencies = {
  enqueueBulkUpdatePostDaySitemaps,
  enqueueMonthlyBackfillArchiveContinuation,
  enqueueUpdateFamilySitemap,
  cleanupRetiredSitemapGenerations,
  enqueueRetiredSitemapCleanupContinuation,
}

export async function processUpdatePostDaySitemap(
  {
    postType,
    day,
  }: {
    postType: (typeof SITEMAP_CONFIG.POST_TYPES)[number]
    day: string
  },
  dependencies = updatePostDaySitemapDependencies,
): Promise<void> {
  const result = await dependencies.generatePostDaySitemapFiles(postType, day)
  if (result.hasMore && result.continuationId) {
    await dependencies.enqueuePostDaySitemapContinuation({ postType, day }, result.continuationId)
    return
  }
  await dependencies.invalidateSitemaps()
  await Promise.all([
    dependencies.enqueueUpdatePostTypeIndex(postType),
    dependencies.enqueueUpdatePostsIndex(),
    dependencies.enqueueUpdateRootIndex(),
  ])
}

export async function processUpdatePostTypeIndex(
  postType: (typeof SITEMAP_CONFIG.POST_TYPES)[number],
  dependencies = updateSitemapIndexDependencies,
): Promise<void> {
  await dependencies.generatePostTypeIndex(postType)
  await dependencies.invalidateSitemaps()
}

export async function processUpdatePostsIndex(
  dependencies = updateSitemapIndexDependencies,
): Promise<void> {
  await dependencies.generatePostsIndex()
  await dependencies.invalidateSitemaps()
}

export async function processUpdateFamilySitemap(
  family: (typeof SITEMAP_CONFIG.FAMILY_TYPES)[number],
  dependencies = updateSitemapIndexDependencies,
): Promise<void> {
  const result = await dependencies.generateSitemapFamilyFiles(family)
  if (result.hasMore && result.continuationId) {
    await dependencies.enqueueFamilySitemapContinuation(family, result.continuationId)
    return
  }
  await Promise.all([dependencies.invalidateSitemaps(), dependencies.enqueueUpdateRootIndex()])
}

export async function processUpdateRootIndex(
  dependencies = updateSitemapIndexDependencies,
): Promise<void> {
  await dependencies.generateRootIndex()
  await dependencies.invalidateSitemaps()
}

export async function processNightlyBackfillWeekDispatcher(
  dependencies: Pick<
    typeof backfillDispatcherDependencies,
    | 'enqueueBulkUpdatePostDaySitemaps'
    | 'enqueueUpdateFamilySitemap'
    | 'cleanupRetiredSitemapGenerations'
    | 'enqueueRetiredSitemapCleanupContinuation'
  > = backfillDispatcherDependencies,
): Promise<void> {
  const now = new Date()
  const entries = getNightlyBackfillEntries(now, SITEMAP_CONFIG.POST_TYPES)
  await Promise.all([
    dependencies.enqueueBulkUpdatePostDaySitemaps(entries),
    ...SITEMAP_CONFIG.FAMILY_TYPES.map(family => dependencies.enqueueUpdateFamilySitemap(family)),
  ])
  await processRetiredSitemapCleanup(dependencies, now)
}

export async function processWeeklyBackfillMonthDispatcher(): Promise<void> {
  const now = new Date()
  const entries = getWeeklyBackfillEntries(now, SITEMAP_CONFIG.POST_TYPES)
  await enqueueBulkUpdatePostDaySitemaps(entries)
}

/**
 * One bounded page of the archive backfill: the next days after `afterDay`, then a continuation
 * from this page's last day, so the ever-growing archive never fans out in a single job.
 */
export async function processMonthlyBackfillArchiveDispatcher(
  afterDay?: string,
  dependencies: Pick<
    typeof backfillDispatcherDependencies,
    'enqueueBulkUpdatePostDaySitemaps' | 'enqueueMonthlyBackfillArchiveContinuation'
  > = backfillDispatcherDependencies,
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
