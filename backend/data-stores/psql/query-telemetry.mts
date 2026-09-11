import { emitAnalytics } from './analytics-emit.mts'

export type QueryPoolLabel = 'read' | 'write' | 'client'

export interface QueryTimingInput {
  /** Leading annotation comment of the query, or null when unannotated. */
  annotation: string | null
  pool: QueryPoolLabel
  durationMs: number
  rowCount: number
  error: boolean
  cursorBatches?: number
  pipelined?: boolean
  batchSize?: number
}

/** Below this, an errored query is routine (e.g. an asserted constraint violation), not a stall. */
const SLOW_QUERY_FAILURE_LOG_THRESHOLD_MS = 500

/**
 * Names the query behind a slow, errored test-database statement on stderr. `QueryTimingInput`
 * carries no error object or SQLSTATE (see `execute-client-query.mjs`), so this cannot filter on
 * the Postgres error code directly; `durationMs` is the available discriminator instead. Tests
 * routinely provoke and assert expected constraint-violation errors that fail in single-digit ms —
 * gating on `SLOW_QUERY_FAILURE_LOG_THRESHOLD_MS` keeps those silent while still naming a query
 * that stalls until it clears `statement_timeout` (`test-helpers/statement-timeout.mts`), which the
 * bare `canceling statement due to statement timeout` (57014) error otherwise never names.
 */
function maybeLogTestQueryFailure(input: QueryTimingInput): void {
  const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST)
  if (!isTestEnv || !input.error) return
  if (input.durationMs <= SLOW_QUERY_FAILURE_LOG_THRESHOLD_MS) return
  process.stderr.write(
    `[pg-query-failed] annotation=${input.annotation ?? 'unannotated'} pool=${input.pool} ms=${input.durationMs}\n`,
  )
}

/**
 * Fire-and-forget per-query timing emit. A cheap early-out keeps the hot path free when analytics
 * is disabled (the default in dev/test); never throws into the query path.
 */
export function recordQueryTiming(input: QueryTimingInput): void {
  maybeLogTestQueryFailure(input)

  const backend = process.env.ANALYTICS_BACKEND
  if (!backend || backend === 'disabled') return
  if (!isQueryTimingSampled()) return

  const now = new Date()
  const record = {
    event_id: crypto.randomUUID(),
    event_time: now,
    event_date: now.toISOString().slice(0, 10),
    env: process.env.NODE_ENV ?? 'development',
    annotation: input.annotation || 'unannotated',
    pool: input.pool,
    duration_ms: input.durationMs,
    row_count: input.rowCount,
    error: input.error,
    ...(input.cursorBatches === undefined ? {} : { cursor_batches: input.cursorBatches }),
    ...(input.pipelined === undefined ? {} : { pipelined: input.pipelined }),
    ...(input.batchSize === undefined ? {} : { batch_size: input.batchSize }),
  }
  emitAnalytics('pg_query_timing', record)
}

/** `PG_QUERY_TIMING_SAMPLE` in [0, 1]; unset/>=1 emits every query, <=0 emits none. */
function isQueryTimingSampled(): boolean {
  const raw = process.env.PG_QUERY_TIMING_SAMPLE
  if (raw === undefined || raw === '') return true
  const rate = Number(raw)
  if (!Number.isFinite(rate) || rate >= 1) return true
  if (rate <= 0) return false
  return Math.random() < rate
}
