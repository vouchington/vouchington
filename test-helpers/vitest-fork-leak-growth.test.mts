import { describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { registerPsqlPoolMetrics } from '../backend/test-helpers/psql-pool-metrics.mts'
import { getRegisteredPoolMetrics } from 'vouchington-tooling/vitest-diagnostics'

function fakePsqlPool(
  totalCount: number,
  idleCount: number,
  waitingCount: number,
): import('pg').Pool {
  return Object.assign(new EventEmitter(), {
    totalCount,
    idleCount,
    waitingCount,
  }) as import('pg').Pool
}

describe('fork leak growth diagnostics', () => {
  it('reads existing PostgreSQL pool metrics without creating a pool', () => {
    vi.stubGlobal(Symbol.for('vitest-fork-leak-pool-metrics'), undefined)
    vi.stubGlobal(Symbol.for('vitest-fork-leak-pool-socket-handles'), undefined)
    const write = fakePsqlPool(20, 17, 2)
    const read = fakePsqlPool(8, 8, 0)
    const advisoryLock = fakePsqlPool(4, 1, 3)
    const jobSerialization = fakePsqlPool(2, 1, 0)
    try {
      registerPsqlPoolMetrics({ write, read, advisoryLock, jobSerialization })
      registerPsqlPoolMetrics({ write, read, advisoryLock, jobSerialization })
      expect(write.listenerCount('connect')).toBe(1)
      write.emit('connect')

      expect(getRegisteredPoolMetrics()).toEqual({
        write: {
          total: 20,
          idle: 17,
          nonIdleOrConnecting: 3,
          waiting: 2,
        },
        read: {
          total: 8,
          idle: 8,
          nonIdleOrConnecting: 0,
          waiting: 0,
        },
        advisoryLock: {
          total: 4,
          idle: 1,
          nonIdleOrConnecting: 3,
          waiting: 3,
        },
        jobSerialization: {
          total: 2,
          idle: 1,
          nonIdleOrConnecting: 1,
          waiting: 0,
        },
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
