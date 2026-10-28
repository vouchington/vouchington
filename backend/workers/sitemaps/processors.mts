import { processRetiredSitemapCleanup } from './processors/retired-cleanup.mts'
import { runMonthlyBackfillArchivePage } from './processors/archive-backfill.mts'
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
import {
  enqueueBulkUpdatePostDaySitemaps,
  enqueueFamilySitemapContinuation,
  enqueuePostDaySitemapContinuation,
  enqueueUpdateFamilySitemap,
  enqueueUpdatePostTypeIndex,
  enqueueUpdatePostsIndex,
  enqueueUpdateRootIndex,
} from '@queues/sitemaps/enqueues'
import { invalidate } from '@services/entity-cache/invalidate'

export async function processUpdatePostDaySitemap({
  postType,
  day,
  generationId,
}: {
  postType: (typeof SITEMAP_CONFIG.POST_TYPES)[number]
  day: string
  /** Set only on a continuation; it no-ops when that generation is gone or replaced. */
  generationId?: string
}): Promise<void> {
  const result = await generatePostDaySitemapFiles(postType, day, undefined, generationId)
  if (result.stale) return
  if (result.hasMore && result.continuationId && result.generationId) {
    await enqueuePostDaySitemapContinuation(
      { postType, day, generationId: result.generationId },
      result.continuationId,
    )
    return
  }
  await invalidate.sitemaps()
  await Promise.all([
    enqueueUpdatePostTypeIndex(postType),
    enqueueUpdatePostsIndex(),
    enqueueUpdateRootIndex(),
  ])
}

export async function processUpdatePostTypeIndex(
  postType: (typeof SITEMAP_CONFIG.POST_TYPES)[number],
): Promise<void> {
  await generatePostTypeIndex(postType)
  await invalidate.sitemaps()
}

export async function processUpdatePostsIndex(): Promise<void> {
  await generatePostsIndex()
  await invalidate.sitemaps()
}

export async function processUpdateFamilySitemap({
  family,
  generationId,
}: {
  family: (typeof SITEMAP_CONFIG.FAMILY_TYPES)[number]
  /** Set only on a continuation; it no-ops when that generation is gone or replaced. */
  generationId?: string
}): Promise<void> {
  const result = await generateSitemapFamilyFiles(family, undefined, generationId)
  if (result.stale) return
  if (result.hasMore && result.continuationId && result.generationId) {
    await enqueueFamilySitemapContinuation(family, result.generationId, result.continuationId)
    return
  }
  await Promise.all([invalidate.sitemaps(), enqueueUpdateRootIndex()])
}

export async function processUpdateRootIndex(): Promise<void> {
  await generateRootIndex()
  await invalidate.sitemaps()
}

export async function processNightlyBackfillWeekDispatcher(now = new Date()): Promise<void> {
  const entries = getNightlyBackfillEntries(now, SITEMAP_CONFIG.POST_TYPES)
  await Promise.all([
    enqueueBulkUpdatePostDaySitemaps(entries),
    ...SITEMAP_CONFIG.FAMILY_TYPES.map(family => enqueueUpdateFamilySitemap(family)),
  ])
  await processRetiredSitemapCleanup(now)
}

export async function processWeeklyBackfillMonthDispatcher(now = new Date()): Promise<void> {
  const entries = getWeeklyBackfillEntries(now, SITEMAP_CONFIG.POST_TYPES)
  await enqueueBulkUpdatePostDaySitemaps(entries)
}

export const processMonthlyBackfillArchiveDispatcher = (afterDay?: string, now = new Date()) =>
  runMonthlyBackfillArchivePage(afterDay, now)
