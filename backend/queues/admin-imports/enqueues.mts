import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '@queues/background/enqueues'
import {
  IMPORTS_DISPATCH_ADMIN_TOPIC_IMPORT_JOB,
  IMPORTS_PROCESS_ADMIN_TOPIC_IMPORT_ROW_JOB,
  type AdminTopicImportRowData,
} from '@queues/background/enqueues/imports-jobs'
import { background } from '@queues/background/queues'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import {
  ADMIN_TOPIC_IMPORT_DISPATCH_ID_PREFIX,
  ADMIN_TOPIC_IMPORT_ROW_DEDUP_PREFIX,
} from './config.mts'

const enqueueDispatch = createBackgroundEnqueue(IMPORTS_DISPATCH_ADMIN_TOPIC_IMPORT_JOB)

// A dispatcher cannot re-add itself under the job id it is running with (GlideMQ drops an add
// whose id is still claimed), so each page has its own id built from the batch and the cursor.
const dispatchJobId = (batchId: string, cursor: number | undefined) =>
  `${ADMIN_TOPIC_IMPORT_DISPATCH_ID_PREFIX}__${batchId}__${cursor ?? 'start'}`
const dispatchOptions = (batchId: string, cursor: number | undefined) =>
  ({
    jobId: dispatchJobId(batchId, cursor),
    removeOnComplete: true,
    removeOnFail: true,
  }) satisfies Partial<JobOptions>

/** Starts a batch's dispatcher at its first pending row. */
export function enqueueAdminTopicImportDispatch(batchId: string): EnqueueReturnType {
  return enqueueDispatch({ batchId }, dispatchOptions(batchId, undefined))
}

type DispatchInput = { batchId: string; cursor?: number }

const enqueueBulkDispatch = createBackgroundBulkEnqueue(
  IMPORTS_DISPATCH_ADMIN_TOPIC_IMPORT_JOB,
  (input: DispatchInput) => ({
    data: input,
    opts: dispatchOptions(input.batchId, input.cursor),
  }),
)

// A dispatcher that stalled past its limit stays in the failed set under its job id whatever
// `removeOnFail` says, so a start or continuation id is released before it is added again.
function enqueueDispatchesReactivating(inputs: DispatchInput[]) {
  return enqueueBulkReactivatingFinished({
    queue: background,
    inputs,
    jobIdOf: input => dispatchJobId(input.batchId, input.cursor),
    enqueueBulk: enqueueBulkDispatch,
  })
}

/** Continues a batch's dispatcher after the page that ended at `cursor`. */
export function enqueueAdminTopicImportDispatchContinuation(batchId: string, cursor: number) {
  return enqueueDispatchesReactivating([{ batchId, cursor }])
}

/** Starts the dispatchers of several batches at their first pending row. */
export function enqueueAdminTopicImportDispatches(batchIds: string[]) {
  return enqueueDispatchesReactivating(batchIds.map(batchId => ({ batchId })))
}

export const enqueueBulkAdminTopicImportRows = createBackgroundBulkEnqueue(
  IMPORTS_PROCESS_ADMIN_TOPIC_IMPORT_ROW_JOB,
  (row: AdminTopicImportRowData) => ({
    data: row,
    opts: {
      deduplication: {
        id: `${ADMIN_TOPIC_IMPORT_ROW_DEDUP_PREFIX}__${row.rowId}`,
        mode: 'simple' as const,
      },
    } satisfies Partial<JobOptions>,
  }),
)
