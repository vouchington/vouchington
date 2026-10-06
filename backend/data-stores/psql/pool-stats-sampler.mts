import type pg from 'pg'
import { emitAnalytics } from './analytics-emit.mts'

const DEFAULT_INTERVAL_MS = 60_000

export interface SampledPools {
  write: Pick<pg.Pool, 'totalCount' | 'idleCount' | 'waitingCount'>
  read: Pick<pg.Pool, 'totalCount' | 'idleCount' | 'waitingCount'>
  advisoryLock: Pick<pg.Pool, 'totalCount' | 'idleCount' | 'waitingCount'>
  readMax: number
  writeMax: number
  advisoryLockMax: number
}

type PoolStatsInterval = { unref(): void; dispose(): void }
type PoolStatsScheduler = (callback: () => void, intervalMs: number) => PoolStatsInterval

export function createPoolStatsSampler(schedule: PoolStatsScheduler = schedulePoolStatsInterval) {
  let timer: PoolStatsInterval | null = null

  /**
   * Pool connection accounting is per-process, so it must be sampled inside each process that owns
   * a pool (api, workers) rather than from a queue job that would only see the worker's pool.
   * No-ops when analytics is disabled (the default in dev/test); the interval is `unref`'d so it
   * never keeps a process alive.
   */
  function startConfiguredPoolStatsSampler(
    pools: {
      writePool: SampledPools['write']
      readPool: SampledPools['read']
      advisoryLockPool: SampledPools['advisoryLock']
    },
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

  function startPoolStatsSampler(
    pools: SampledPools,
    intervalMs: number = poolStatsIntervalMs(),
  ): void {
    if (timer) return
    const backend = process.env.ANALYTICS_BACKEND
    if (!backend || backend === 'disabled') return

    timer = schedule(() => emitPoolStats(pools), intervalMs)
    timer.unref()
  }

  function clearSamplerInterval(): void {
    if (!timer) return
    timer.dispose()
    timer = null
  }

  return {
    startConfiguredPoolStatsSampler,
    startPoolStatsSampler,
    async [Symbol.asyncDispose]() {
      clearSamplerInterval()
    },
  }
}

const poolStatsSampler = createPoolStatsSampler()

export const { startConfiguredPoolStatsSampler } = poolStatsSampler

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

function poolGauge(
  label: 'advisory-lock' | 'read' | 'write',
  pool: SampledPools['write'],
  max: number,
) {
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

function schedulePoolStatsInterval(callback: () => void, intervalMs: number): PoolStatsInterval {
  const timer = setInterval(callback, intervalMs)
  return {
    unref() {
      timer.unref()
    },
    dispose() {
      clearInterval(timer)
    },
  }
}
