import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '@queues/background/enqueues'
import {
  IMPORTS_DISPATCH_USER_RSS_FEED_IMPORT_JOB,
  IMPORTS_PROCESS_USER_RSS_FEED_IMPORT_ROW_JOB,
  IMPORTS_RECOVER_STALLED_JOB,
  type UserRssFeedImportRowData,
} from '@queues/background/enqueues/imports-jobs'
import { background } from '@queues/background/queues'
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
const dispatchJobId = (importId: string, cursor: number | undefined) =>
  `${USER_RSS_FEED_IMPORT_DISPATCH_ID_PREFIX}__${importId}__${cursor ?? 'start'}`
const dispatchOptions = (importId: string, cursor: number | undefined) =>
  ({
    jobId: dispatchJobId(importId, cursor),
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

const enqueueBulkDispatch = createBackgroundBulkEnqueue(
  IMPORTS_DISPATCH_USER_RSS_FEED_IMPORT_JOB,
  (importId: string) => ({ data: { importId }, opts: dispatchOptions(importId, undefined) }),
)

/**
 * Starts the dispatchers of several imports. A dispatcher that stalled past its limit stays in the
 * failed set under its job id whatever `removeOnFail` says, so the start id is released first.
 */
export function enqueueUserRssFeedImportDispatches(importIds: string[]) {
  return enqueueBulkReactivatingFinished({
    queue: background,
    inputs: importIds,
    jobIdOf: importId => dispatchJobId(importId, undefined),
    enqueueBulk: enqueueBulkDispatch,
  })
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

const enqueueRecovery = createBackgroundEnqueue(IMPORTS_RECOVER_STALLED_JOB)

/** Runs one sweep that re-dispatches imports left without a dispatcher. */
export function enqueueRecoverStalledImports(): EnqueueReturnType {
  return enqueueRecovery({})
}
