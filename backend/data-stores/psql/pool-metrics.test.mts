import { describe, expect, it } from 'vitest'
import { advisoryLockPool, readPool, writePool } from './setup.mts'

describe('PostgreSQL pool metrics', () => {
  it('reports the initialized write, read, and advisory pools', () => {
    const metricsProvider = (
      globalThis as typeof globalThis & Record<symbol, (() => unknown) | undefined>
    )[Symbol.for('vitest-fork-leak-psql-pool-metrics')]
    expect(metricsProvider?.()).toEqual({
      write: expectedPoolMetrics(writePool),
      read: expectedPoolMetrics(readPool),
      advisoryLock: expectedPoolMetrics(advisoryLockPool),
    })
  })
})

function expectedPoolMetrics(pool: import('pg').Pool) {
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    nonIdleOrConnecting: pool.totalCount - pool.idleCount,
    waiting: pool.waitingCount,
  }
}
