import { createBackgroundEnqueue } from '@queues/background/enqueues'
import { MODERATION_SIGNALS_SPAM_DETECTION_JOB } from '@queues/background/enqueues/moderation-signals-jobs'
import type { JobOptions } from 'glide-mq'
import { DEDUPLICATION_TTL_MS, PRIORITY_DEFAULT } from './config.mts'

export {
  enqueueBulkDetectBanEvasionAfterPostEmbeddings,
  enqueueDetectBanEvasion,
  enqueueDetectBanEvasionOnJoin,
} from './enqueues/ban-evasion.mts'

type EnqueueSpamDetectionOptions = {
  contentSha256?: Buffer | string
  deduplicationKey?: string
  priority?: number
}

function normalizeContentSha256(contentSha256?: Buffer | string): string | undefined {
  if (!contentSha256) return undefined
  return Buffer.isBuffer(contentSha256) ? contentSha256.toString('hex') : contentSha256
}

function makeJobOpts(
  postId: string,
  priority: number,
  deduplicationKey?: string,
): Partial<JobOptions> {
  return {
    priority,
    deduplication: {
      id: deduplicationKey
        ? `spam_detection_${postId}_${deduplicationKey}`
        : `spam_detection_${postId}`,
      mode: 'debounce',
      ttl: DEDUPLICATION_TTL_MS,
    },
  }
}

const enqueueSpamDetectionJob = createBackgroundEnqueue(MODERATION_SIGNALS_SPAM_DETECTION_JOB)

export const enqueueSpamDetection = (postId: string, options: EnqueueSpamDetectionOptions = {}) => {
  const contentSha256 = normalizeContentSha256(options.contentSha256)
  const deduplicationKey = options.deduplicationKey ?? contentSha256
  return enqueueSpamDetectionJob(
    { id: postId, ...(contentSha256 ? { contentSha256 } : {}) },
    makeJobOpts(postId, options.priority ?? PRIORITY_DEFAULT, deduplicationKey),
  )
}
