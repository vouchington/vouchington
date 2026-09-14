import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { JobOptions } from 'glide-mq'
import { PRIORITY_DEFAULT, SPAM_DETECTION_DEFAULTS, SPAM_DETECTION_QUEUE_NAME } from './config.mts'
import { spam_detection } from './queues.mts'

type SpamDetectionData = { id: string; contentSha256?: string }

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
      ttl: SPAM_DETECTION_DEFAULTS.deduplicationTtlMs,
    },
  }
}

const defaults = {
  attempts: SPAM_DETECTION_DEFAULTS.attempts,
  removeOnComplete: SPAM_DETECTION_DEFAULTS.removeOnComplete,
  removeOnFail: SPAM_DETECTION_DEFAULTS.removeOnFail,
} satisfies Partial<JobOptions>

const enqueueSpamDetectionJob = createEnqueueFunction<SpamDetectionData, 'post'>({
  queue: spam_detection,
  queueName: SPAM_DETECTION_QUEUE_NAME,
  jobName: 'post',
  defaults,
})

export const enqueueSpamDetection = (postId: string, options: EnqueueSpamDetectionOptions = {}) => {
  const contentSha256 = normalizeContentSha256(options.contentSha256)
  const deduplicationKey = options.deduplicationKey ?? contentSha256
  return enqueueSpamDetectionJob(
    { id: postId, ...(contentSha256 ? { contentSha256 } : {}) },
    makeJobOpts(postId, options.priority ?? PRIORITY_DEFAULT, deduplicationKey),
  )
}
