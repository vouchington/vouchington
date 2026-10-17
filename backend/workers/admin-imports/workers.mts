import { backgroundHandler } from '@queues/background/enqueues/define-handler'
import {
  IMPORTS_DISPATCH_ADMIN_TOPIC_IMPORT_JOB,
  IMPORTS_PROCESS_ADMIN_TOPIC_IMPORT_ROW_JOB,
} from '@queues/background/enqueues/imports-jobs'
import { dispatchAdminTopicImport } from '@services/admin-imports/dispatch-batch'
import { processImportRow } from './processors.mts'

const ROW_ATTEMPTS = IMPORTS_PROCESS_ADMIN_TOPIC_IMPORT_ROW_JOB.options.attempts ?? 1

export const adminImportsHandlers = [
  backgroundHandler(IMPORTS_DISPATCH_ADMIN_TOPIC_IMPORT_JOB, job => {
    if (!job.data?.batchId) throw new Error('Admin import dispatch job .batchId is required')
    return dispatchAdminTopicImport(job.data)
  }),
  backgroundHandler(IMPORTS_PROCESS_ADMIN_TOPIC_IMPORT_ROW_JOB, job => {
    const { batchId, rowId } = job.data ?? {}
    if (!batchId) throw new Error('Admin import job .batchId is required')
    if (!rowId) throw new Error('Admin import job .rowId is required')
    return processImportRow(batchId, rowId, {
      isFinalAttempt: job.attemptsMade + 1 >= ROW_ATTEMPTS,
    })
  }),
]
