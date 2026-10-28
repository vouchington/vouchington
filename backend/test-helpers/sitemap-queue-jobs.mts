import {
  SITEMAPS_MONTHLY_BACKFILL_JOB,
  SITEMAPS_POST_DAY_JOB,
  type SitemapArchiveBackfillData,
} from '@queues/background/enqueues/sitemaps-jobs'

type SitemapPostDayData = NonNullable<(typeof SITEMAPS_POST_DAY_JOB)['data']>

type QueuedJob = { name: string; data: unknown }

/** Reads the typed payload only for the matching sitemap job. */
export function getSitemapPostDayData(job: QueuedJob): SitemapPostDayData | null {
  if (job.name !== SITEMAPS_POST_DAY_JOB.name || !isRecord(job.data)) return null
  const { postType, day, generationId } = job.data
  if (typeof postType !== 'string' || typeof day !== 'string') return null
  if (generationId !== undefined && typeof generationId !== 'string') return null
  return { postType, day, ...(generationId === undefined ? {} : { generationId }) }
}

/** Reads an archive cursor without treating other background jobs as archive continuations. */
export function getSitemapArchiveBackfillData(job: QueuedJob): SitemapArchiveBackfillData | null {
  if (job.name !== SITEMAPS_MONTHLY_BACKFILL_JOB.name || !isRecord(job.data)) return null
  const { afterDay } = job.data
  if (afterDay !== undefined && typeof afterDay !== 'string') return null
  return afterDay === undefined ? {} : { afterDay }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
