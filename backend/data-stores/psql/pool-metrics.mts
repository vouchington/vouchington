import type pg from 'pg'

export type PsqlPoolMetric = {
  total: number
  idle: number
  nonIdleOrConnecting: number
  waiting: number
}

export type PsqlPoolMetrics = {
  write: PsqlPoolMetric
  read: PsqlPoolMetric
  advisoryLock: PsqlPoolMetric
}

type PsqlPoolMetricsProvider = () => PsqlPoolMetrics

export function registerPsqlPoolMetricsForTestEnvironment(
  pools: PsqlPools,
  environment: string | undefined,
): boolean {
  if (environment !== 'test') return false

  const target = globalThis as typeof globalThis & Record<symbol, PsqlPoolMetricsProvider>
  target[psqlPoolMetricsKey()] = () => ({
    write: snapshotPool(pools.write),
    read: snapshotPool(pools.read),
    advisoryLock: snapshotPool(pools.advisoryLock),
  })
  return true
}

export function getExistingPsqlPoolMetrics(): PsqlPoolMetrics | null {
  const target = globalThis as typeof globalThis & Partial<Record<symbol, PsqlPoolMetricsProvider>>
  return target[psqlPoolMetricsKey()]?.() ?? null
}

type PsqlPools = {
  write: pg.Pool
  read: pg.Pool
  advisoryLock: pg.Pool
}

function snapshotPool(pool: pg.Pool): PsqlPoolMetric {
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    nonIdleOrConnecting: pool.totalCount - pool.idleCount,
    waiting: pool.waitingCount,
  }
}

function psqlPoolMetricsKey(): symbol {
  return Symbol.for('vitest-fork-leak-psql-pool-metrics')
}
