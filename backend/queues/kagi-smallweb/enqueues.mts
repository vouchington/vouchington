import { createHash } from 'node:crypto'
import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '@queues/background/enqueues'
import {
  KAGI_SMALLWEB_PROCESS_FEED_JOB,
  KAGI_SMALLWEB_SYNC_JOB,
  type KagiFeedJobData,
} from '@queues/background/enqueues/kagi-smallweb-jobs'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { KAGI_SMALLWEB_ORDERING, KAGI_SMALLWEB_PROCESS_DEDUP_TTL_MS } from './config.mts'

const BACKFILL_DEDUPLICATION_TTL_MS = 60 * 60_000

const enqueueKagiSmallWebSyncJob = createBackgroundEnqueue(KAGI_SMALLWEB_SYNC_JOB)

export const enqueueBulkProcessKagiFeeds = createBackgroundBulkEnqueue(
  KAGI_SMALLWEB_PROCESS_FEED_JOB,
  (entry: KagiFeedJobData) => ({
    data: entry,
    opts: {
      deduplication: {
        id: `kagi_process_feed__${entry.feedUrl}`,
        mode: 'throttle' as const,
        ttl: KAGI_SMALLWEB_PROCESS_DEDUP_TTL_MS,
      },
    } satisfies Partial<JobOptions>,
  }),
)

type KagiSmallWebSyncOptions = {
  deduplicationId?: string
}

export function enqueueKagiSmallWebSync(options?: KagiSmallWebSyncOptions): EnqueueReturnType {
  return enqueueKagiSmallWebSyncJob({}, {
    ordering: KAGI_SMALLWEB_ORDERING.dispatcher,
    ...(options?.deduplicationId && {
      deduplication: {
        id: options.deduplicationId,
        mode: 'throttle' as const,
        ttl: BACKFILL_DEDUPLICATION_TTL_MS,
      },
    }),
  } satisfies Partial<JobOptions>)
}

// A continuation carries the last feed URL of the page before it. Its job id is a digest of that
// cursor, so a retried sync cannot enqueue a second continuation, and a finished record releases it.
export function enqueueKagiSmallWebSyncContinuation(
  cursor: string,
  options: Partial<JobOptions> = {},
): EnqueueReturnType {
  return enqueueKagiSmallWebSyncJob(
    { cursor },
    {
      jobId: `kagi_smallweb_sync__${createHash('sha256').update(cursor).digest('hex')}`,
      ordering: KAGI_SMALLWEB_ORDERING.dispatcher,
      removeOnComplete: true,
      removeOnFail: true,
      ...options,
    },
  )
}
