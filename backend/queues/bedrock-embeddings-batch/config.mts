export const PRIORITY_DEFAULT = 10
export const PRIORITY_DISPATCHER = 100

export const BEDROCK_EMBEDDINGS_BATCH_DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
  deduplicationTtlMs: 60_000,
}
