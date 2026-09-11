export const LANGUAGE_DETECTION_QUEUE_NAME = 'language_detection'
export const PRIORITY_DEFAULT = 10
export const LANGUAGE_DETECTION_DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 1000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
  deduplicationTtlMs: 60_000,
} as const
