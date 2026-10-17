import { backgroundHandler } from '@queues/background/enqueues/define-handler'
import {
  KAGI_SMALLWEB_PROCESS_FEED_JOB,
  KAGI_SMALLWEB_SYNC_JOB,
} from '@queues/background/enqueues/kagi-smallweb-jobs'
import { dispatchKagiSmallWeb } from '@services/kagi-smallweb'
import { processFeedEntry } from '@services/kagi-smallweb/process-feed-entry'

export const kagiSmallWebHandlers = [
  backgroundHandler(KAGI_SMALLWEB_SYNC_JOB, job => dispatchKagiSmallWeb(job.data?.cursor)),
  backgroundHandler(KAGI_SMALLWEB_PROCESS_FEED_JOB, job => processFeedEntry(job.data)),
]
