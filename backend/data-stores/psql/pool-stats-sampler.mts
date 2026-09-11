import type pg from 'pg'
import { emitAnalytics } from './analytics-emit.mts'

const DEFAULT_INTERVAL_MS = 60_000

export interface SampledPools {
  write: pg.Pool
  read: pg.Pool
  advisoryLock: pg.Pool
  readMax: number
  writeMax: number
  advisoryLockMax: number
}

let timer: NodeJS.Timeout | null = null

/**
 * Pool connection accounting is per-process, so it must be sampled inside each process that owns
 * a pool (api, workers) rather than from a queue job that would only see the worker's pool.
 * No-ops when analytics is disabled (the default in dev/test); the interval is `unref`'d so it
 * never keeps a process alive.
 */
export function startConfiguredPoolStatsSampler(
  pools: { writePool: pg.Pool; readPool: pg.Pool; advisoryLockPool: pg.Pool },
  limits: { readMax: number; writeMax: number; advisoryLockMax: number },
  nodePrewarm: boolean,
): void {
  if (nodePrewarm) return
  startPoolStatsSampler({
    write: pools.writePool,
    read: pools.readPool,
    advisoryLock: pools.advisoryLockPool,
    readMax: limits.readMax,
    writeMax: limits.writeMax,
    advisoryLockMax: limits.advisoryLockMax,
  })
}

export function startPoolStatsSampler(
  pools: SampledPools,
  intervalMs: number = poolStatsIntervalMs(),
): void {
  if (timer) return
  const backend = process.env.ANALYTICS_BACKEND
  if (!backend || backend === 'disabled') return

  timer = setInterval(() => emitPoolStats(pools), intervalMs)
  timer.unref()
}

export function stopPoolStatsSampler(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
}

/** Emit one gauge record per pool. Exported for direct, deterministic testing. */
export function emitPoolStats(pools: SampledPools): void {
  const now = new Date()
  emitAnalytics('pg_pool_stats', {
    ...baseRecord(now),
    ...poolGauge('write', pools.write, pools.writeMax),
  })
  emitAnalytics('pg_pool_stats', {
    ...baseRecord(now),
    ...poolGauge('read', pools.read, pools.readMax),
  })
  emitAnalytics('pg_pool_stats', {
    ...baseRecord(now),
    ...poolGauge('advisory-lock', pools.advisoryLock, pools.advisoryLockMax),
  })
}

function poolGauge(label: 'advisory-lock' | 'read' | 'write', pool: pg.Pool, max: number) {
  return {
    pool: label,
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
    max,
  }
}

function baseRecord(now: Date) {
  return {
    event_id: crypto.randomUUID(),
    event_time: now,
    event_date: now.toISOString().slice(0, 10),
    env: process.env.NODE_ENV ?? 'development',
  }
}

function poolStatsIntervalMs(): number {
  const raw = Number(process.env.PG_POOL_STATS_INTERVAL_MS)
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_INTERVAL_MS
}
