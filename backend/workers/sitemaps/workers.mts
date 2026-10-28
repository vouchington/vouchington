import { processRetiredSitemapCleanup } from './processors/retired-cleanup.mts'
import { backgroundHandler } from '@queues/background/enqueues/define-handler'
import {
  SITEMAPS_FAMILY_JOB,
  SITEMAPS_MONTHLY_BACKFILL_JOB,
  SITEMAPS_NIGHTLY_BACKFILL_JOB,
  SITEMAPS_POSTS_INDEX_JOB,
  SITEMAPS_POST_DAY_JOB,
  SITEMAPS_POST_TYPE_INDEX_JOB,
  SITEMAPS_ROOT_INDEX_JOB,
  SITEMAPS_RETIRED_CLEANUP_JOB,
  SITEMAPS_WEEKLY_BACKFILL_JOB,
} from '@queues/background/enqueues/sitemaps-jobs'
import {
  processMonthlyBackfillArchiveDispatcher,
  processNightlyBackfillWeekDispatcher,
  processUpdateFamilySitemap,
  processUpdatePostDaySitemap,
  processUpdatePostTypeIndex,
  processUpdatePostsIndex,
  processUpdateRootIndex,
  processWeeklyBackfillMonthDispatcher,
} from './processors.mts'
import {
  optionalGenerationId,
  requireJobFamily,
  requireJobPostType,
  requireJobString,
} from './processors/job-data.mts'

export const sitemapsHandlers = [
  backgroundHandler(SITEMAPS_RETIRED_CLEANUP_JOB, () => processRetiredSitemapCleanup()),
  backgroundHandler(SITEMAPS_POST_DAY_JOB, job =>
    processUpdatePostDaySitemap({
      postType: requireJobPostType(job.data?.postType),
      day: requireJobString(job.data?.day, 'day'),
      ...optionalGenerationId(job.data?.generationId),
    }),
  ),
  backgroundHandler(SITEMAPS_POST_TYPE_INDEX_JOB, job =>
    processUpdatePostTypeIndex(requireJobPostType(job.data?.postType)),
  ),
  backgroundHandler(SITEMAPS_POSTS_INDEX_JOB, () => processUpdatePostsIndex()),
  backgroundHandler(SITEMAPS_FAMILY_JOB, job =>
    processUpdateFamilySitemap({
      family: requireJobFamily(job.data?.family),
      ...optionalGenerationId(job.data?.generationId),
    }),
  ),
  backgroundHandler(SITEMAPS_ROOT_INDEX_JOB, () => processUpdateRootIndex()),
  backgroundHandler(SITEMAPS_NIGHTLY_BACKFILL_JOB, () => processNightlyBackfillWeekDispatcher()),
  backgroundHandler(SITEMAPS_WEEKLY_BACKFILL_JOB, () => processWeeklyBackfillMonthDispatcher()),
  backgroundHandler(SITEMAPS_MONTHLY_BACKFILL_JOB, job =>
    processMonthlyBackfillArchiveDispatcher(job.data?.afterDay),
  ),
]
