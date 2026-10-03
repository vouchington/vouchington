/** The half-open window `[from, to)` of runs, by reservation time (the run's UUIDv7 `id`). */
export type ClassifierUsageWindow = { from: Date; to: Date }

/**
 * What one classifier run cost and how it fanned out. Provider figures come from the ai-usage
 * ledger rows attributed to the run (`ai_usage_records.classifier_run_id`), so a response that
 * failed strict decoding but was billed is counted. A provider call that returned no 2xx response
 * (a network or 5xx failure) writes no ledger row, so it shows up only as
 * `attemptsWithoutRecordedResponse`. That does not mean it was free: an ambiguous failure may have
 * billed, which latches the day's accounting uncertainty rather than being recorded here.
 */
export type ClassifierRunUsage = {
  runId: string
  classifier: string
  primitive: string
  subjectKind: 'post' | 'rss_feed_item'
  subjectId: string
  /** Hex of the subject's content digest; with the subject, one content version. */
  inputSha256: string
  /** Hex of the configuration digest; the other half of the receipt's identity. */
  configurationSha256: string
  /** The community publication the run is scoped to (C8), else null. */
  communityIdentityId: string | null
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
  /** Reserved attempts with no ledger row: nothing was recorded for them, billed or not. */
  attemptsWithoutRecordedResponse: number
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
  attemptsWithoutRecordedResponse: number
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

/**
 * Everything one content version cost: a classifier's runs for one subject at one input digest
 * (and community publication), whatever their configurations. The receipt identity admits one run
 * per configuration, so more than one run here means the configuration changed.
 */
export type ClassifierContentVersionUsage = {
  classifier: string
  subjectKind: 'post' | 'rss_feed_item'
  subjectId: string
  inputSha256: string
  communityIdentityId: string | null
  /** Runs (receipts) reserved for this content version, one per configuration digest. */
  runs: number
  /** Runs that billed at least one provider response. */
  billedRuns: number
  /**
   * Billed runs beyond the first: the same content classified again under a changed configuration
   * (a C8 rule edit, a new prompt version). A count to read, not a failure: each receipt was still
   * allowed one call. An unchanged configuration cannot produce a second receipt.
   */
  reclassifications: number
  attemptsStarted: number
  retries: number
  sweepEnqueues: number
  /** Billed provider responses recorded in the ledger, summed over the version's runs. */
  providerCalls: number
  /** The most billed responses any one run (receipt) of this version has. The KPI is at most one. */
  maxProviderCallsPerRun: number
  /** Runs with more than one billed response: an attempt that billed and was then repeated. */
  runsOverOneCall: number
  attemptsWithoutRecordedResponse: number
  /** Provider calls whose outcomes were persisted: the responses the content version used. */
  persistedDecisionCalls: number
  /** Runs that have not finished: they can still call the provider, so the version can still grow. */
  unfinishedRuns: number
  /** Billed responses the ledger could not price: `costMicrounits` leaves them out. */
  unpricedCalls: number
  costMicrounits: string
  latencyMsTotal: number
  latencySamples: number
  /** Local detector runs, never billed and not counted in `providerCalls`. */
  localDetectorRuns: number
}

/**
 * One classifier's content versions summed, with how many billed calls each receipt took. The D3
 * KPI holds for the classifier when `maxProviderCallsPerRun` is at most one: every receipt, hence
 * every content version under one configuration, took at most one billed call.
 */
export type ClassifierEfficiency = {
  classifier: string
  contentVersions: number
  runs: number
  providerCalls: number
  /** Runs that billed at least one provider response; the rest were local, replayed or unbilled. */
  billedRuns: number
  maxProviderCallsPerRun: number
  /** Runs with more than one billed call; each is listed in the content version it belongs to. */
  runsOverOneCall: number
  /** Billed runs beyond the first per content version: configuration changes, not breaches. */
  reclassifications: number
  attemptsStarted: number
  retries: number
  sweepEnqueues: number
  attemptsWithoutRecordedResponse: number
  /**
   * Runs with outcome `incomplete`. Settled runs (completed, superseded, failed) can no longer
   * call the provider; an unfinished one can, so a verdict that holds is only final without them.
   */
  unfinishedRuns: number
  /** Billed responses the ledger could not price: `costMicrounits` leaves them out. */
  unpricedCalls: number
  costMicrounits: string
  latencyMsTotal: number
  latencySamples: number
  localDetectorRuns: number
}

export type ClassifierUsageReport = {
  window: ClassifierUsageWindow
  runs: ClassifierRunUsage[]
  groups: ClassifierUsageGroup[]
  contentVersions: ClassifierContentVersionUsage[]
  efficiency: ClassifierEfficiency[]
  /** Durable dispatch requests per classifier slug. Diagnostic only; never a KPI. */
  requests: Record<string, number>
  /** Every active classifier in the catalog, so the report can say which ones saw no activity. */
  classifiers: string[]
}
