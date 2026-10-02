/** The half-open window `[from, to)` of runs, by reservation time (the run's UUIDv7 `id`). */
export type ClassifierUsageWindow = { from: Date; to: Date }

/**
 * What one classifier run cost and how it fanned out. Provider figures come from the ai-usage
 * ledger rows attributed to the run (`ai_usage_records.classifier_run_id`), so a response that
 * failed strict decoding but was billed is counted. A provider call that returned no 2xx response
 * (a network or 5xx failure) writes no ledger row; it shows up only as `unbilledAttempts`.
 */
export type ClassifierRunUsage = {
  runId: string
  classifier: string
  primitive: string
  /** Null for a run that never reserved a remote batch (local-only work). */
  batchId: string | null
  promptVersionId: string | null
  provider: string | null
  /** The model the prompt version asks for; the ledger keeps the model the provider served. */
  model: string | null
  scopeCategory: string | null
  scopeCommunityId: string | null
  /** Decision calls (shards) persisted under the batch. */
  shardCount: number
  /** Candidate results the batch retained; a run that never completed a call retains none. */
  candidateCount: number
  /** `completed`, `superseded`, `incomplete` or `failed:<terminal failure kind>`. */
  outcome: string
  /** Provider calls reserved under lease (`provider_attempts_started`). */
  attemptsStarted: number
  /** Reserved attempts after the first one. */
  retries: number
  /** Recovery-sweep enqueues that added a job. Diagnostic only; never a KPI. */
  sweepEnqueues: number
  /** Billed provider responses recorded in the ledger, including failed and incomplete ones. */
  providerCalls: number
  /** Reserved attempts with no ledger row (the request never produced a billed response). */
  unbilledAttempts: number
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  pricedCalls: number
  unpricedCalls: number
  /** Sum of the priced calls, in millionths of a US dollar, as a decimal string. */
  costMicrounits: string
  latencyMsTotal: number
  latencyMsMax: number | null
  /** Ledger rows that carry a latency; the mean is `latencyMsTotal / latencySamples`. */
  latencySamples: number
  /** The local detector that ran for this run, never billed. Null when none ran. */
  localDetector: string | null
}

/** Runs of one classifier, prompt version and scope category, summed. */
export type ClassifierUsageGroup = {
  classifier: string
  primitive: string
  provider: string | null
  model: string | null
  promptVersionId: string | null
  scopeCategory: string | null
  runs: number
  outcomes: Record<string, number>
  attemptsStarted: number
  retries: number
  sweepEnqueues: number
  providerCalls: number
  unbilledAttempts: number
  shards: number
  candidates: number
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  pricedCalls: number
  unpricedCalls: number
  costMicrounits: string
  latencyMsTotal: number
  latencyMsMax: number | null
  latencySamples: number
  /** Local detector calls are counted apart from provider calls and cost nothing. */
  localDetectorCalls: number
  localCostMicrounits: '0'
}

export type ClassifierUsageReport = {
  window: ClassifierUsageWindow
  runs: ClassifierRunUsage[]
  groups: ClassifierUsageGroup[]
  /** Durable dispatch requests per classifier slug. Diagnostic only; never a KPI. */
  requests: Record<string, number>
}
