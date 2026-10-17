import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '@queues/background/enqueues'
import {
  IMPORTS_DISPATCH_USER_RSS_FEED_IMPORT_JOB,
  IMPORTS_PROCESS_USER_RSS_FEED_IMPORT_ROW_JOB,
  type UserRssFeedImportRowData,
} from '@queues/background/enqueues/imports-jobs'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import {
  USER_RSS_FEED_IMPORT_DISPATCH_ID_PREFIX,
  USER_RSS_FEED_IMPORT_ROW_DEDUP_PREFIX,
} from './config.mts'

const enqueueDispatch = createBackgroundEnqueue(IMPORTS_DISPATCH_USER_RSS_FEED_IMPORT_JOB)

// Each page is its own job: a dispatcher cannot re-add itself under the job id it is running
// with, because GlideMQ drops an add whose id is still claimed. The id carries the import and the
// cursor, so a retried page cannot enqueue a second continuation, and `removeOnComplete` and
// `removeOnFail` release the id once the page has run.
const dispatchOptions = (importId: string, cursor: number | undefined) =>
  ({
    jobId: `${USER_RSS_FEED_IMPORT_DISPATCH_ID_PREFIX}__${importId}__${cursor ?? 'start'}`,
    removeOnComplete: true,
    removeOnFail: true,
  }) satisfies Partial<JobOptions>

/** Starts an import's dispatcher at its first pending row. */
export function enqueueUserRssFeedImportDispatch(importId: string): EnqueueReturnType {
  return enqueueDispatch({ importId }, dispatchOptions(importId, undefined))
}

/** Continues an import's dispatcher after the page that ended at `cursor`. */
export function enqueueUserRssFeedImportDispatchContinuation(
  importId: string,
  cursor: number,
): EnqueueReturnType {
  return enqueueDispatch({ importId, cursor }, dispatchOptions(importId, cursor))
}

export const enqueueBulkUserRssFeedImportRows = createBackgroundBulkEnqueue(
  IMPORTS_PROCESS_USER_RSS_FEED_IMPORT_ROW_JOB,
  (row: UserRssFeedImportRowData) => ({
    data: row,
    opts: {
      deduplication: {
        id: `${USER_RSS_FEED_IMPORT_ROW_DEDUP_PREFIX}__${row.rowId}`,
        mode: 'simple' as const,
      },
    } satisfies Partial<JobOptions>,
  }),
)
