import { describe, expect, it } from 'vitest'
import {
  getExistingPsqlPoolMetrics,
  registerPsqlPoolMetricsForTestEnvironment,
} from '@data-stores/psql/pool-metrics'
import { createForkLeakDetector, formatForkLeakDiagnostics } from './vitest-fork-leak-detection.mts'

const TYPE = 'TCPSocketWrap'

function recordAll(detector: ReturnType<typeof createForkLeakDetector>, counts: readonly number[]) {
  return counts.flatMap(count => detector.record(new Map([[TYPE, count]])))
}

function fakePsqlPool(
  totalCount: number,
  idleCount: number,
  waitingCount: number,
): import('pg').Pool {
  return { totalCount, idleCount, waitingCount } as import('pg').Pool
}

describe('fork leak growth checkpoint detection', () => {
  it('absorbs a finite lazy PostgreSQL pool ramp during the test sequence', () => {
    const detector = createForkLeakDetector()

    expect(recordAll(detector, [...Array(5).fill(1), ...Array(4).fill(21), 40])).toEqual([])
  })

  it('keeps an episode across short high-water plateaus and retains its first largest step', () => {
    const detector = createForkLeakDetector()

    expect(
      recordAll(detector, [
        ...Array(5).fill(1),
        ...Array(3).fill(21),
        ...Array(2).fill(40),
        ...Array(3).fill(60),
        ...Array(2).fill(80),
      ]),
    ).toMatchObject([
      {
        baseline: 1,
        current: 80,
        streak: 6,
        growthCheckpoints: 3,
        requiredGrowthCheckpoints: 3,
        suspectedGrowth: { previous: 1, current: 21, delta: 20 },
      },
    ])
  })

  it('requires continuation after a finite three-pool ramp', () => {
    const ramp = [...Array(5).fill(1), 21, 21, 41, 41, 42]

    expect(recordAll(createForkLeakDetector(), [...ramp, ...Array(5).fill(42)])).toEqual([])
    expect(recordAll(createForkLeakDetector(), [...ramp, 60])).toMatchObject([
      { baseline: 1, current: 60, growthCheckpoints: 3 },
    ])
  })

  it('flags bounded dips while the episode keeps making new highs', () => {
    const detector = createForkLeakDetector()

    expect(recordAll(detector, [...Array(5).fill(1), 20, 21, 22, 21, 23, 24])).toMatchObject([
      { baseline: 1, current: 24, growthCheckpoints: 4 },
    ])
  })

  it('detects both bounded-dip primary growth and lower rolling recovery', () => {
    const ramp = [...Array(5).fill(1), 21, 40, 60, 40]

    expect(recordAll(createForkLeakDetector(), [...ramp, 30, 61])).toMatchObject([
      { baseline: 1, current: 61, growthCheckpoints: 3 },
    ])
    expect(
      recordAll(createForkLeakDetector(), [...Array(5).fill(1), 100, 20, 20, 21, 21, 22]),
    ).toEqual([])
    expect(
      recordAll(createForkLeakDetector(), [...Array(5).fill(1), 100, 20, 21, 22, 23, 24, 25]),
    ).toMatchObject([
      {
        baseline: 1,
        current: 25,
        streak: 5,
        growthCheckpoints: 4,
        suspectedGrowth: { previous: 20, current: 21, delta: 1 },
      },
    ])
  })

  it('rebases after a confirmed plateau so a second finite pool ramp remains tolerated', () => {
    const detector = createForkLeakDetector()

    expect(
      recordAll(detector, [
        ...Array(5).fill(1),
        ...Array(4).fill(21),
        40,
        ...Array(5).fill(40),
        ...Array(4).fill(60),
        80,
      ]),
    ).toEqual([])
  })

  it('does not count oscillation below a previous high as additional growth', () => {
    const detector = createForkLeakDetector()

    expect(recordAll(detector, [...Array(5).fill(1), 20, 40, 21, 40, 21])).toEqual([])
  })

  it('clears an incomplete episode when the count returns to its baseline band', () => {
    const detector = createForkLeakDetector({
      warmupCheckpoints: 1,
      leakThreshold: 0,
      sustainedCheckpoints: 3,
    })

    expect(recordAll(detector, [1, 2, 3, 1, 2, 2, 2])).toEqual([])
  })

  it('confirms a lower stable candidate plateau after a transient high', () => {
    const detector = createForkLeakDetector()

    expect(
      recordAll(detector, [...Array(5).fill(1), 100, ...Array(6).fill(20), 25, 26, 27, 28, 29, 30]),
    ).toMatchObject([{ baseline: 20, current: 30, growthCheckpoints: 5 }])
  })

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
      }),
    ).toContain(
      'PostgreSQL pool metrics: write(total=20,idle=19,non-idle-or-connecting=1,waiting=0) read(total=20,idle=20,non-idle-or-connecting=0,waiting=0) advisory-lock(total=4,idle=4,non-idle-or-connecting=0,waiting=0)',
    )
  })

  it('reads existing PostgreSQL pool metrics without creating a pool', () => {
    expect(
      registerPsqlPoolMetricsForTestEnvironment(
        {
          write: fakePsqlPool(20, 17, 2),
          read: fakePsqlPool(8, 8, 0),
          advisoryLock: fakePsqlPool(4, 1, 3),
        },
        'test',
      ),
    ).toBe(true)

    expect(getExistingPsqlPoolMetrics()).toEqual({
      write: { total: 20, idle: 17, nonIdleOrConnecting: 3, waiting: 2 },
      read: { total: 8, idle: 8, nonIdleOrConnecting: 0, waiting: 0 },
      advisoryLock: { total: 4, idle: 1, nonIdleOrConnecting: 3, waiting: 3 },
    })
  })

  it('does not install or replace PostgreSQL metrics outside the test environment', () => {
    const originalMetrics = getExistingPsqlPoolMetrics()
    const registered = registerPsqlPoolMetricsForTestEnvironment(
      {
        write: fakePsqlPool(99, 0, 99),
        read: fakePsqlPool(99, 0, 99),
        advisoryLock: fakePsqlPool(99, 0, 99),
      },
      'production',
    )

    expect(registered).toBe(false)
    expect(getExistingPsqlPoolMetrics()).toEqual(originalMetrics)
  })
})
