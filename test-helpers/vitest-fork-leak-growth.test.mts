import { describe, expect, it } from 'vitest'
import { EventEmitter } from 'node:events'
import {
  registerPsqlPoolMetricsForTestEnvironment,
  type PsqlPoolMetrics,
  type PsqlPoolSocketHandles,
} from '@data-stores/psql/pool-metrics'
import { createForkLeakDetector } from 'vouchington-tooling/vitest-diagnostics'
import {
  formatForkLeakDiagnostics,
  getRegisteredPsqlPoolMetrics,
} from './vitest-fork-leak-diagnostics.mts'

const TYPE = 'TCPSocketWrap'

function recordAll(detector: ReturnType<typeof createForkLeakDetector>, counts: readonly number[]) {
  return counts.flatMap(count => detector.record(new Map([[TYPE, count]])))
}

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
  it('does not let PostgreSQL pool context suppress raw resource growth', () => {
    const detector = createForkLeakDetector({
      warmupCheckpoints: 1,
      leakThreshold: 0,
      sustainedCheckpoints: 3,
    })
    detector.record(new Map([[TYPE, 1]]))
    const [verdict] = recordAll(detector, [2, 3, 4, 5])

    expect(verdict).toMatchObject({ baseline: 1, current: 5, growthCheckpoints: 3 })
    expect(
      formatForkLeakDiagnostics(verdict!, new Map([[TYPE, 5]]), {
        write: { total: 20, idle: 19, nonIdleOrConnecting: 1, waiting: 0 },
        read: { total: 20, idle: 20, nonIdleOrConnecting: 0, waiting: 0 },
        advisoryLock: { total: 4, idle: 4, nonIdleOrConnecting: 0, waiting: 0 },
        jobSerialization: { total: 4, idle: 4, nonIdleOrConnecting: 0, waiting: 0 },
      }),
    ).toContain(
      'PostgreSQL pool metrics: write(total=20,idle=19,non-idle-or-connecting=1,waiting=0) read(total=20,idle=20,non-idle-or-connecting=0,waiting=0) advisory-lock(total=4,idle=4,non-idle-or-connecting=0,waiting=0) job-serialization(total=4,idle=4,non-idle-or-connecting=0,waiting=0)',
    )
  })

  it('reads existing PostgreSQL pool metrics without creating a pool', () => {
    const target = globalThis as typeof globalThis & Record<symbol, unknown>
    const metricsKey = Symbol.for('vitest-fork-leak-psql-pool-metrics')
    const handlesKey = Symbol.for('vitest-fork-leak-psql-pool-socket-handles')
    const previousMetrics = target[metricsKey]
    const previousHandles = target[handlesKey]
    const write = fakePsqlPool(20, 17, 2)
    const read = fakePsqlPool(8, 8, 0)
    const advisoryLock = fakePsqlPool(4, 1, 3)
    const jobSerialization = fakePsqlPool(2, 1, 0)
    try {
      expect(
        registerPsqlPoolMetricsForTestEnvironment(
          { write, read, advisoryLock, jobSerialization },
          'test',
        ),
      ).toBe(true)
      write.emit('connect')

      expect(getRegisteredPsqlPoolMetrics()).toEqual({
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
      if (previousMetrics === undefined) delete target[metricsKey]
      else target[metricsKey] = previousMetrics as () => PsqlPoolMetrics
      if (previousHandles === undefined) delete target[handlesKey]
      else target[handlesKey] = previousHandles as () => PsqlPoolSocketHandles
    }
  })

  it('does not install or replace PostgreSQL metrics outside the test environment', () => {
    const originalMetrics = getRegisteredPsqlPoolMetrics()
    const registered = registerPsqlPoolMetricsForTestEnvironment(
      {
        write: fakePsqlPool(99, 0, 99),
        read: fakePsqlPool(99, 0, 99),
        advisoryLock: fakePsqlPool(99, 0, 99),
        jobSerialization: fakePsqlPool(99, 0, 99),
      },
      'production',
    )

    expect(registered).toBe(false)
    expect(getRegisteredPsqlPoolMetrics()).toEqual(originalMetrics)
  })
})
