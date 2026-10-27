import { createBackgroundEnqueue } from '@queues/background/enqueues'
import { MODERATION_SIGNALS_SPAM_DETECTION_JOB } from '@queues/background/enqueues/moderation-signals-jobs'
import { PRIORITY_DEFAULT } from './config.mts'

export {
  enqueueBulkDetectBanEvasionAfterPostEmbeddings,
  enqueueDetectBanEvasion,
  enqueueDetectBanEvasionOnJoin,
} from './enqueues/ban-evasion.mts'

const enqueueSpamDetectionJob = createBackgroundEnqueue(MODERATION_SIGNALS_SPAM_DETECTION_JOB)

/** One durable job per moderation version. A repeated add with this id is a no-op. */
export const enqueueSpamDetection = (versionId: string) => {
  return enqueueSpamDetectionJob(
    { versionId },
    { jobId: `${versionId}__spam_detection`, priority: PRIORITY_DEFAULT },
  )
}
