import { createBulkEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { PRIORITY_DEFAULT, QUEUE_NAME, USER_RSS_FEED_IMPORTS_DEFAULTS } from './config.mts'
import { userRssFeedImports } from './queues.mts'
import type { UserRssFeedImportJobs, UserRssFeedImportRowJob } from './types.mts'

const JOB_NAME: UserRssFeedImportJobs = 'processImportRow'

const enqueueBulkImportRowJobs = createBulkEnqueueFunction<
  UserRssFeedImportRowJob,
  UserRssFeedImportRowJob,
  UserRssFeedImportJobs
>({
  queue: userRssFeedImports,
  queueName: QUEUE_NAME,
  jobName: JOB_NAME,
  defaults: {
    attempts: USER_RSS_FEED_IMPORTS_DEFAULTS.attempts,
    backoff: USER_RSS_FEED_IMPORTS_DEFAULTS.backoff,
    removeOnComplete: USER_RSS_FEED_IMPORTS_DEFAULTS.removeOnComplete,
    removeOnFail: USER_RSS_FEED_IMPORTS_DEFAULTS.removeOnFail,
  },
  buildJob: job => ({
    data: job,
    opts: {
      deduplication: {
        id: `${JOB_NAME}__${job.rowId}`,
        mode: 'debounce' as const,
        ttl: USER_RSS_FEED_IMPORTS_DEFAULTS.deduplicationTtlMs,
      },
    },
  }),
})

export function enqueueBulkUserRssFeedImportRows(
  jobs: UserRssFeedImportRowJob[],
): EnqueueReturnType {
  return enqueueBulkImportRowJobs(jobs, {
    priority: PRIORITY_DEFAULT,
  } satisfies Partial<JobOptions>)
}
