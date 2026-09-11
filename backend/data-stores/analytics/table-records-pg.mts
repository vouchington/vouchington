import type { AnalyticsBaseRecord } from './table-records.mts'

// PostgreSQL telemetry records (per-query timing, pool gauges, vote drift).

/** One record per executed PostgreSQL query, keyed by its leading annotation comment. */
export interface PgQueryTimingRecord extends AnalyticsBaseRecord {
  /** Leading annotation comment of the query, or `unannotated`. */
  annotation: string
  pool: 'read' | 'write' | 'client'
  duration_ms: number
  row_count: number
  error: boolean
  /** Present for cursor-backed operations; ordinary queries omit it. */
  cursor_batches?: number
  /** Present when the query ran inside `pipelineBatch`; ordinary queries omit it. */
  pipelined?: boolean
  /** Present with `pipelined`; size of that `pipelineBatch` call. */
  batch_size?: number
}

/** Periodic gauge snapshot of a `pg.Pool`'s connection accounting. */
export interface PgPoolStatsRecord extends AnalyticsBaseRecord {
  pool: 'advisory-lock' | 'read' | 'write'
  /** Total connections (idle + in-use). */
  total: number
  idle: number
  /** Requests queued waiting for a connection — pool-saturation signal. */
  waiting: number
  max: number
}

/** Periodic reconciliation of denormalized vote counters against the source-of-truth votes. */
export interface PgVoteDriftRecord extends AnalyticsBaseRecord {
  entity_table: string
  sampled: number
  drifted: number
  sample_entity_id?: string
}
