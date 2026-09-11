export const QUEUE_NAME = 'admin-imports'
export const PRIORITY_DEFAULT = 10

export const ADMIN_IMPORTS_DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
  deduplicationTtlMs: 60_000,
}
