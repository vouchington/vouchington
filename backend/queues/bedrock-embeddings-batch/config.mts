export const QUEUE_NAME = 'bedrock-embeddings-batch'
export const CREATION_QUEUE_NAME = 'bedrock-embeddings-batch-creation'
export const PRIORITY_DEFAULT = 10
export const PRIORITY_DISPATCHER = 100

export const BEDROCK_EMBEDDINGS_BATCH_ORDERING = {
  polling: { key: 'polling', concurrency: 10, rateLimit: { max: 10, duration: 1000 } },
  dispatcher: { key: 'dispatcher', concurrency: 1 },
  reconciliation: { key: 'reconciliation', concurrency: 1 },
} as const

export const BEDROCK_EMBEDDINGS_BATCH_DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
  deduplicationTtlMs: 60_000,
}
