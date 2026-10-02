import { write } from '@data-stores/psql'
import { timestampToUuidv7LowerBound } from '@ts-shared/utils/uuidv7'
import sql from 'sql-template-strings'
import type { ClassifierRunUsage, ClassifierUsageWindow } from './usage-report-types.mts'

/**
 * A ledger row's id carries the request start time from the application clock (`createdAt` in
 * `recordAiUsage`), while the run id carries the database clock. The ledger lower bound sits this
 * far before the window so a small clock difference never hides the first call of a run reserved
 * at the window's start.
 */
const LEDGER_CLOCK_SKEW_MS = 60_000

/** One row per run, so a window past this many runs is rejected rather than silently cut short. */
const CLASSIFIER_USAGE_REPORT_MAX_RUNS = 20_000

type RunRow = {
  run_id: string
  classifier: string
  primitive: string
  subject_kind: 'post' | 'rss_feed_item'
  subject_id: string
  input_sha256: string
  configuration_sha256: string
  community_identity_id: string | null
  batch_id: string | null
  prompt_version_id: string | null
  provider: string | null
  model: string | null
  scope_category: string | null
  scope_community_id: string | null
  shard_count: number
  candidate_count: number
  outcome: string
  attempts_started: number
  sweep_enqueues: number
  provider_calls: number
  input_tokens: number
  cached_input_tokens: number
  output_tokens: number
  priced_calls: number
  unpriced_calls: number
  cost_microunits: string
  latency_ms_total: number
  latency_ms_max: number | null
  latency_samples: number
  local_detector: string | null
}

export function assertClassifierUsageWindow({ from, to }: ClassifierUsageWindow): void {
  if (!(from.getTime() < to.getTime())) {
    throw new RangeError('Classifier usage window must start before it ends')
  }
}

/**
 * Reads every run reserved inside the window with its ledger usage. The window is an index range
 * on the run `id`. The ledger join has only a lower bound: a retry is billed after the run was
 * reserved, so its row can land after the window ends and must still count. `maxRuns` is the
 * guard's size, a parameter only so a test can reach it with two runs instead of twenty thousand.
 */
export async function readClassifierRunUsage(
  window: ClassifierUsageWindow,
  maxRuns = CLASSIFIER_USAGE_REPORT_MAX_RUNS,
): Promise<ClassifierRunUsage[]> {
  assertClassifierUsageWindow(window)
  const lowerBound = timestampToUuidv7LowerBound(window.from.getTime())
  const upperBound = timestampToUuidv7LowerBound(window.to.getTime())
  const ledgerLowerBound = timestampToUuidv7LowerBound(window.from.getTime() - LEDGER_CLOCK_SKEW_MS)
  const { rows } = await write<RunRow>(sql`/* readClassifierRunUsage */
    SELECT run.id AS run_id,
      classifier.slug AS classifier,
      classifier.primitive::text AS primitive,
      CASE WHEN run.post_id IS NOT NULL THEN 'post' ELSE 'rss_feed_item' END AS subject_kind,
      COALESCE(run.post_id, run.rss_feed_item_id) AS subject_id,
      encode(run.input_sha256, 'hex') AS input_sha256,
      encode(run.configuration_sha256, 'hex') AS configuration_sha256,
      run.community_identity_id,
      run.decision_batch_id AS batch_id,
      batch.prompt_version_id,
      prompt.model_provider::text AS provider,
      prompt.model_name AS model,
      batch.scope_category,
      batch.scope_community_id,
      (SELECT count(*)::int FROM classifier_decision_calls call
        WHERE call.batch_id = run.decision_batch_id) AS shard_count,
      (SELECT count(*)::int FROM (
        SELECT 1 FROM topic_classifier_results result
          WHERE result.batch_id = run.decision_batch_id
        UNION ALL
        SELECT 1 FROM story_classifier_results result
          WHERE result.batch_id = run.decision_batch_id
        UNION ALL
        SELECT 1 FROM community_prompt_classifier_results result
          WHERE result.batch_id = run.decision_batch_id
      ) results) AS candidate_count,
      CASE
        WHEN run.completed_at IS NOT NULL THEN 'completed'
        WHEN run.terminal_failure_kind IS NOT NULL THEN 'failed:' || run.terminal_failure_kind
        WHEN run.superseded_at IS NOT NULL THEN 'superseded'
        ELSE 'incomplete'
      END AS outcome,
      run.provider_attempts_started AS attempts_started,
      run.sweep_enqueue_count AS sweep_enqueues,
      usage.provider_calls,
      usage.input_tokens,
      usage.cached_input_tokens,
      usage.output_tokens,
      usage.priced_calls,
      usage.unpriced_calls,
      usage.cost_microunits,
      usage.latency_ms_total,
      usage.latency_ms_max,
      usage.latency_samples,
      local_outcome.detector AS local_detector
    FROM classifier_runs run
    JOIN classifiers classifier ON classifier.id = run.classifier_id
    LEFT JOIN classifier_decision_batches batch ON batch.id = run.decision_batch_id
    LEFT JOIN classifier_prompt_versions prompt ON prompt.id = batch.prompt_version_id
    LEFT JOIN post_classifier_local_outcomes local_outcome ON local_outcome.run_id = run.id
    CROSS JOIN LATERAL (
      SELECT count(*)::int AS provider_calls,
        COALESCE(sum(ledger.input_tokens), 0)::float8 AS input_tokens,
        COALESCE(sum(ledger.cached_input_tokens), 0)::float8 AS cached_input_tokens,
        COALESCE(sum(ledger.output_tokens), 0)::float8 AS output_tokens,
        count(*) FILTER (WHERE ledger.pricing_status = 'priced')::int AS priced_calls,
        count(*) FILTER (WHERE ledger.pricing_status = 'unpriced')::int AS unpriced_calls,
        COALESCE(sum(ledger.cost_microunits), 0)::text AS cost_microunits,
        COALESCE(sum(ledger.latency_ms), 0)::float8 AS latency_ms_total,
        max(ledger.latency_ms) AS latency_ms_max,
        count(ledger.latency_ms)::int AS latency_samples
      FROM ai_usage_records ledger
      WHERE ledger.classifier_run_id = run.id AND ledger.id >= ${ledgerLowerBound}
    ) usage
    WHERE run.id >= ${lowerBound} AND run.id < ${upperBound}
    ORDER BY run.id
    LIMIT ${maxRuns + 1}
  `)
  if (rows.length > maxRuns) {
    throw new RangeError('Classifier usage window holds too many runs; narrow the window')
  }
  return rows.map(toRunUsage)
}

function toRunUsage(row: RunRow): ClassifierRunUsage {
  return {
    runId: row.run_id,
    classifier: row.classifier,
    primitive: row.primitive,
    subjectKind: row.subject_kind,
    subjectId: row.subject_id,
    inputSha256: row.input_sha256,
    configurationSha256: row.configuration_sha256,
    communityIdentityId: row.community_identity_id,
    batchId: row.batch_id,
    promptVersionId: row.prompt_version_id,
    provider: row.provider,
    model: row.model,
    scopeCategory: row.scope_category,
    scopeCommunityId: row.scope_community_id,
    shardCount: row.shard_count,
    candidateCount: row.candidate_count,
    outcome: row.outcome,
    attemptsStarted: row.attempts_started,
    retries: Math.max(row.attempts_started - 1, 0),
    sweepEnqueues: row.sweep_enqueues,
    providerCalls: row.provider_calls,
    attemptsWithoutRecordedResponse: Math.max(row.attempts_started - row.provider_calls, 0),
    inputTokens: row.input_tokens,
    cachedInputTokens: row.cached_input_tokens,
    outputTokens: row.output_tokens,
    pricedCalls: row.priced_calls,
    unpricedCalls: row.unpriced_calls,
    costMicrounits: row.cost_microunits,
    latencyMsTotal: row.latency_ms_total,
    latencyMsMax: row.latency_ms_max,
    latencySamples: row.latency_samples,
    localDetector: row.local_detector,
  }
}
