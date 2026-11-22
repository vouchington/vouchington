import { createPoolStatsSampler, type PoolStats } from '@vouchington/postgres/query-telemetry'
import onError from '@modules/on-error'
import { emitAnalytics } from './analytics-emit.mts'

const DEFAULT_INTERVAL_MS = 60_000

type PoolName = 'advisory-lock' | 'job-serialization' | 'read' | 'write'
type SamplerPools = Parameters<typeof createPoolStatsSampler>[0]['pools']

/** One `pg_pool_stats` gauge record per pool, all stamped with the same sample time. */
export function emitPoolStats(stats: readonly PoolStats[], sampledAt: Date): void {
  for (const { pool, ...gauge } of stats) {
    emitAnalytics('pg_pool_stats', {
      event_id: crypto.randomUUID(),
      event_time: sampledAt,
      event_date: sampledAt.toISOString().slice(0, 10),
      env: process.env.NODE_ENV ?? 'development',
      pool: pool as PoolName,
      ...gauge,
    })
  }
}

function poolStatsIntervalMs(): number {
  const raw = Number(process.env.PG_POOL_STATS_INTERVAL_MS)
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_INTERVAL_MS
}

/**
 * Pool accounting is per process, so each process that owns pools samples them. No-ops when
 * analytics is disabled (the default in dev/test); the interval is unref'd by the sampler.
 */
export function startPoolStatsTelemetry(pools: SamplerPools): void {
  const backend = process.env.ANALYTICS_BACKEND
  const sampler = createPoolStatsSampler({
    pools,
    emit: emitPoolStats,
    intervalMs: poolStatsIntervalMs(),
    reportError: onError,
  })
  if (backend && backend !== 'disabled') sampler.start()
}
