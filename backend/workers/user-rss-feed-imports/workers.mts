import { backgroundHandler } from '@queues/background/enqueues/define-handler'
import {
  IMPORTS_DISPATCH_USER_RSS_FEED_IMPORT_JOB,
  IMPORTS_PROCESS_USER_RSS_FEED_IMPORT_ROW_JOB,
} from '@queues/background/enqueues/imports-jobs'
import { dispatchUserRssFeedImport } from '@services/user-import-export/rss-feed-import-dispatch'
import { processRssFeedImportRow } from '@services/user-import-export/rss-feed-imports'

const ROW_ATTEMPTS = IMPORTS_PROCESS_USER_RSS_FEED_IMPORT_ROW_JOB.options.attempts ?? 1

// A row runs under the worker's default lock: its own 15 second feed budget, not a longer lock,
// bounds how long it can hold a slot.
export const userRssFeedImportsHandlers = [
  backgroundHandler(IMPORTS_DISPATCH_USER_RSS_FEED_IMPORT_JOB, job => {
    if (!job.data?.importId)
      throw new Error('User RSS feed import dispatch job .importId is required')
    return dispatchUserRssFeedImport(job.data)
  }),
  backgroundHandler(IMPORTS_PROCESS_USER_RSS_FEED_IMPORT_ROW_JOB, job => {
    const { importId, rowId } = job.data ?? {}
    if (!importId) throw new Error('User RSS feed import job .importId is required')
    if (!rowId) throw new Error('User RSS feed import job .rowId is required')
    return processRssFeedImportRow(importId, rowId, {
      isFinalAttempt: job.attemptsMade + 1 >= ROW_ATTEMPTS,
    })
  }),
]
