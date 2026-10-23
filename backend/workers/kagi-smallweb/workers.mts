import { processPagedDispatcher } from '@data-stores/valkey-glide-mq/paged-dispatcher'
import { background } from '@queues/background/queues'
import { enqueueKagiSmallWebSyncContinuation } from '@queues/kagi-smallweb/enqueues'
import { backgroundHandler } from '@queues/background/enqueues/define-handler'
import {
  KAGI_SMALLWEB_PROCESS_FEED_JOB,
  KAGI_SMALLWEB_SYNC_JOB,
} from '@queues/background/enqueues/kagi-smallweb-jobs'
import { dispatchKagiSmallWeb } from '@services/kagi-smallweb'
import { processFeedEntry } from '@services/kagi-smallweb/process-feed-entry'

export const kagiSmallWebHandlers = [
  backgroundHandler(KAGI_SMALLWEB_SYNC_JOB, job =>
    processPagedDispatcher(job, {
      dispatcher: 'kagi',
      cursorKey: 'feedUrl',
      target: background,
      targetName: 'background',
      readAndDispatch: async pageSize => {
        const { commitValidators, feedListDir, ...result } = await dispatchKagiSmallWeb(
          job.data.cursor,
          pageSize,
          job.data.feedListDir,
        )
        return {
          result,
          afterDispatch: commitValidators,
          ...(result.nextCursor
            ? { next: { cursor: result.nextCursor, ...(feedListDir ? { feedListDir } : {}) } }
            : {}),
        }
      },
      enqueueNext: (data, options) =>
        enqueueKagiSmallWebSyncContinuation(data.cursor!, options, data.feedListDir),
    }),
  ),
  backgroundHandler(KAGI_SMALLWEB_PROCESS_FEED_JOB, job => processFeedEntry(job.data)),
]
