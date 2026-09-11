import { describe, expect, it } from 'vitest'
import { getExistingPsqlPoolMetrics } from './pool-metrics.mts'
import { advisoryLockPool, readPool, writePool } from './setup.mts'

describe('PostgreSQL pool metrics', () => {
  it('reports the initialized write, read, and advisory pools', () => {
    expect(getExistingPsqlPoolMetrics()).toEqual({
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
