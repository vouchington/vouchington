export const QUEUE_NAME = 'elections'
export const PRIORITY_DEFAULT = 10

export const ELECTIONS_ORDERING = {
  topic: { key: 'topic', concurrency: 100 },
  hostname: { key: 'hostname', concurrency: 100 },
  agent_moderation: { key: 'agent_moderation', concurrency: 100 },
  post: { key: 'post', concurrency: 100 },
  entity_relation: { key: 'entity_relation', concurrency: 100 },
  rss_feed_item: { key: 'rss_feed_item', concurrency: 100 },
  user_vouch: { key: 'user_vouch', concurrency: 100 },
} as const

const deduplicationTtlMs = 5_000
const replicaLagSafetyMarginMs = 1_000

export const ELECTIONS_DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 1000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
  deduplicationTtlMs,
  replicaLagSafetyMarginMs,
  recomputeDelayMs: deduplicationTtlMs + replicaLagSafetyMarginMs,
}
