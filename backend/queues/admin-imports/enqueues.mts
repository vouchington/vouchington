import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '@queues/background/enqueues'
import {
  IMPORTS_DISPATCH_ADMIN_TOPIC_IMPORT_JOB,
  IMPORTS_PROCESS_ADMIN_TOPIC_IMPORT_ROW_JOB,
  type AdminTopicImportRowData,
} from '@queues/background/enqueues/imports-jobs'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import {
  ADMIN_TOPIC_IMPORT_DISPATCH_ID_PREFIX,
  ADMIN_TOPIC_IMPORT_ROW_DEDUP_PREFIX,
} from './config.mts'

const enqueueDispatch = createBackgroundEnqueue(IMPORTS_DISPATCH_ADMIN_TOPIC_IMPORT_JOB)

// A dispatcher cannot re-add itself under the job id it is running with (GlideMQ drops an add
// whose id is still claimed), so each page has its own id built from the batch and the cursor.
const dispatchOptions = (batchId: string, cursor: number | undefined) =>
  ({
    jobId: `${ADMIN_TOPIC_IMPORT_DISPATCH_ID_PREFIX}__${batchId}__${cursor ?? 'start'}`,
    removeOnComplete: true,
    removeOnFail: true,
  }) satisfies Partial<JobOptions>

/** Starts a batch's dispatcher at its first pending row. */
export function enqueueAdminTopicImportDispatch(batchId: string): EnqueueReturnType {
  return enqueueDispatch({ batchId }, dispatchOptions(batchId, undefined))
}

/** Continues a batch's dispatcher after the page that ended at `cursor`. */
export function enqueueAdminTopicImportDispatchContinuation(
  batchId: string,
  cursor: number,
): EnqueueReturnType {
  return enqueueDispatch({ batchId, cursor }, dispatchOptions(batchId, cursor))
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
