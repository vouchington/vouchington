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
import { requireJobFamily, requireJobPostType, requireJobString } from './processors/job-data.mts'

const sitemapJobProcessors = {
  processUpdatePostDaySitemap,
  processUpdatePostTypeIndex,
  processUpdatePostsIndex,
  processUpdateFamilySitemap,
  processUpdateRootIndex,
  processNightlyBackfillWeekDispatcher,
  processWeeklyBackfillMonthDispatcher,
  processRetiredSitemapCleanup,
  processMonthlyBackfillArchiveDispatcher,
}

type SitemapJobProcessors = typeof sitemapJobProcessors

/** @internal Handlers over the processors; tests pass substitute processors to observe the routing. */
export function createSitemapsHandlers(processors: SitemapJobProcessors = sitemapJobProcessors) {
  return [
    backgroundHandler(SITEMAPS_RETIRED_CLEANUP_JOB, () =>
      processors.processRetiredSitemapCleanup(),
    ),
    backgroundHandler(SITEMAPS_POST_DAY_JOB, job =>
      processors.processUpdatePostDaySitemap({
        postType: requireJobPostType(job.data?.postType),
        day: requireJobString(job.data?.day, 'day'),
      }),
    ),
    backgroundHandler(SITEMAPS_POST_TYPE_INDEX_JOB, job =>
      processors.processUpdatePostTypeIndex(requireJobPostType(job.data?.postType)),
    ),
    backgroundHandler(SITEMAPS_POSTS_INDEX_JOB, () => processors.processUpdatePostsIndex()),
    backgroundHandler(SITEMAPS_FAMILY_JOB, job =>
      processors.processUpdateFamilySitemap(requireJobFamily(job.data?.family)),
    ),
    backgroundHandler(SITEMAPS_ROOT_INDEX_JOB, () => processors.processUpdateRootIndex()),
    backgroundHandler(SITEMAPS_NIGHTLY_BACKFILL_JOB, () =>
      processors.processNightlyBackfillWeekDispatcher(),
    ),
    backgroundHandler(SITEMAPS_WEEKLY_BACKFILL_JOB, () =>
      processors.processWeeklyBackfillMonthDispatcher(),
    ),
    backgroundHandler(SITEMAPS_MONTHLY_BACKFILL_JOB, job =>
      processors.processMonthlyBackfillArchiveDispatcher(job.data?.afterDay),
    ),
  ]
}

export const sitemapsHandlers = createSitemapsHandlers()
