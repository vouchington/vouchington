import { processRetiredSitemapCleanup } from './processors/retired-cleanup.mts'
import {
  runMonthlyBackfillArchivePage,
  type ArchiveBackfillDependencies,
} from './processors/archive-backfill.mts'
import { SITEMAP_CONFIG } from '@voucha/config/sitemaps'
import {
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
    generationId,
  }: {
    postType: (typeof SITEMAP_CONFIG.POST_TYPES)[number]
    day: string
    /** Set only on a continuation; it no-ops when that generation is gone or replaced. */
    generationId?: string
  },
  dependencies = updatePostDaySitemapDependencies,
): Promise<void> {
  const result = await dependencies.generatePostDaySitemapFiles(
    postType,
    day,
    undefined,
    generationId,
  )
  if (result.stale) return
  if (result.hasMore && result.continuationId && result.generationId) {
    await dependencies.enqueuePostDaySitemapContinuation(
      { postType, day, generationId: result.generationId },
      result.continuationId,
    )
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
  {
    family,
    generationId,
  }: {
    family: (typeof SITEMAP_CONFIG.FAMILY_TYPES)[number]
    /** Set only on a continuation; it no-ops when that generation is gone or replaced. */
    generationId?: string
  },
  dependencies = updateSitemapIndexDependencies,
): Promise<void> {
  const result = await dependencies.generateSitemapFamilyFiles(family, undefined, generationId)
  if (result.stale) return
  if (result.hasMore && result.continuationId && result.generationId) {
    await dependencies.enqueueFamilySitemapContinuation(
      family,
      result.generationId,
      result.continuationId,
    )
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
  now = new Date(),
): Promise<void> {
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

export const processMonthlyBackfillArchiveDispatcher = (
  afterDay?: string,
  dependencies: ArchiveBackfillDependencies = backfillDispatcherDependencies,
) => runMonthlyBackfillArchivePage(afterDay, dependencies)
