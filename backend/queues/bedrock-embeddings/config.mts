export const EMBEDDINGS_NOVA_MULTIMODAL_V1_SINGLE_QUEUE_NAME =
  'bedrock_embeddings_nova_multimodal_v1_single'
export const PRIORITY_DEFAULT = 10

export const BEDROCK_EMBEDDINGS_DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 1000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
  deduplicationTtlMs: 60_000,
}
