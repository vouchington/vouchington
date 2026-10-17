const deduplicationTtlMs = 5_000
const replicaLagSafetyMarginMs = 1_000

export const ELECTIONS_DEFAULTS = {
  deduplicationTtlMs,
  replicaLagSafetyMarginMs,
  recomputeDelayMs: deduplicationTtlMs + replicaLagSafetyMarginMs,
}
