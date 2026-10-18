import { describe, expect, it } from 'vitest'
import { createForkLeakDetector } from 'vouchington-tooling/vitest-diagnostics'
import type { PsqlPoolMetrics, PsqlPoolSocketHandles } from '@data-stores/psql/pool-metrics'
import {
  recordForkLeakCheckpoint,
  waitForForkLeakHandshakeSettle,
  type ForkLeakHandshakeSnapshot,
  type ForkLeakHandshakeSettlement,
} from './vitest-fork-leak-handshake.mts'

function poolMetrics(total: number, idle = total): PsqlPoolMetrics {
  const metric = { total, idle, nonIdleOrConnecting: total - idle, waiting: 0 }
  const empty = { total: 0, idle: 0, nonIdleOrConnecting: 0, waiting: 0 }
  return { write: metric, read: empty, advisoryLock: empty, jobSerialization: empty }
}

function socketHandles(active: readonly object[], owned: readonly object[]): PsqlPoolSocketHandles {
  return { active: new Set(active), owned: new Set(owned) }
}

function recordAll(detector: ReturnType<typeof createForkLeakDetector>, counts: readonly number[]) {
  return counts.flatMap(count => detector.record(new Map([['TCPSocketWrap', count]])))
}

describe('fork-leak handshake settlement', () => {
  it('coalesces a serial TCP burst only when every new handle is marked pool-owned', async () => {
    let tcpSockets = 4
    let connectWraps = 1
    let poolTotal = 4
    let poolIdle = 3
    const tcpHandles = Array.from({ length: tcpSockets }, () => ({}))
    const ownedHandles = [...tcpHandles]
    const result = await waitForForkLeakHandshakeSettle({
      readResources: () => [
        ...Array.from({ length: tcpSockets }, () => 'TCPSocketWrap'),
        ...Array.from({ length: connectWraps }, () => 'ConnectWrap'),
      ],
      readPsqlPoolMetrics: () => poolMetrics(poolTotal, poolIdle),
      readPsqlPoolSocketHandles: () => socketHandles(tcpHandles, ownedHandles),
      stableObservations: 2,
      maxTurns: 20,
      waitForTurn: async () => {
        if (tcpSockets < 8) {
          tcpSockets += 1
          poolTotal += 1
          poolIdle += 1
          const socketHandle = {}
          tcpHandles.push(socketHandle)
          ownedHandles.push(socketHandle)
          return
        }
        connectWraps = 0
        poolIdle = poolTotal
      },
    })

    expect(result.coalesced).toBe(true)
    expect(result.snapshot).toMatchObject({ connectWraps: 0, tcpSockets: 8 })
    expect(result.snapshot.resources).toHaveLength(8)
  })

  it('returns every checkpoint when a TCP handle remains unowned', async () => {
    let tcpSockets = 4
    let poolTotal = 4
    let turns = 0
    const tcpHandles = Array.from({ length: tcpSockets }, () => ({}))
    const ownedHandles = [...tcpHandles]
    const result = await waitForForkLeakHandshakeSettle({
      readResources: () => [
        ...Array.from({ length: tcpSockets }, () => 'TCPSocketWrap'),
        'ConnectWrap',
      ],
      readPsqlPoolMetrics: () => poolMetrics(poolTotal, 3),
      readPsqlPoolSocketHandles: () => socketHandles(tcpHandles, ownedHandles),
      maxTurns: 3,
      waitForTurn: async () => {
        turns += 1
        if (turns === 1) {
          tcpSockets += 1
          poolTotal += 1
          tcpHandles.push({})
        }
      },
    })

    expect(result.coalesced).toBe(false)
    expect(result.observations.map(observation => observation.tcpSockets)).toEqual([4, 4, 5, 5, 5])
    expect(result.detectorSnapshot.tcpSockets).toBe(5)
  })

  it('preserves TCP growth when the transport handle cannot be identified', async () => {
    let tcpSockets = 1
    const result = await waitForForkLeakHandshakeSettle({
      readResources: () => [
        ...Array.from({ length: tcpSockets }, () => 'TCPSocketWrap'),
        'ConnectWrap',
      ],
      readPsqlPoolMetrics: () => poolMetrics(1, 0),
      readPsqlPoolSocketHandles: () => socketHandles([], []),
      waitForTurn: async () => {
        tcpSockets = 2
      },
    })

    expect(result.coalesced).toBe(false)
    expect(result.observations.map(observation => observation.tcpSockets)).toEqual([1, 1, 2, 2, 2])
  })

  it('preserves an unrelated socket alongside a completed pool connection', async () => {
    let tcpSockets = 4
    let poolTotal = 4
    let poolIdle = 3
    const tcpHandles = Array.from({ length: tcpSockets }, () => ({}))
    const ownedHandles = [...tcpHandles]
    const result = await waitForForkLeakHandshakeSettle({
      readResources: () => [
        ...Array.from({ length: tcpSockets }, () => 'TCPSocketWrap'),
        'ConnectWrap',
      ],
      readPsqlPoolMetrics: () => poolMetrics(poolTotal, poolIdle),
      readPsqlPoolSocketHandles: () => socketHandles(tcpHandles, ownedHandles),
      waitForTurn: async () => {
        if (tcpSockets === 4) {
          tcpSockets += 2
          poolTotal += 1
          poolIdle += 1
          const poolSocket = {}
          const testSocket = {}
          tcpHandles.push(poolSocket, testSocket)
          ownedHandles.push(poolSocket)
        }
      },
    })

    expect(result.coalesced).toBe(false)
    expect(result.observations.map(observation => observation.tcpSockets)).toEqual([4, 4, 6, 6, 6])
  })

  it('records the first checkpoint containing later unowned growth after owned pool growth', async () => {
    let tcpSockets = 4
    let poolTotal = 4
    let poolIdle = 3
    let turns = 0
    const tcpHandles = Array.from({ length: tcpSockets }, () => ({}))
    const ownedHandles = [...tcpHandles]
    const result = await waitForForkLeakHandshakeSettle({
      readResources: () => [
        ...Array.from({ length: tcpSockets }, () => 'TCPSocketWrap'),
        ...(turns < 3 ? ['ConnectWrap'] : []),
      ],
      readPsqlPoolMetrics: () => poolMetrics(poolTotal, poolIdle),
      readPsqlPoolSocketHandles: () => socketHandles(tcpHandles, ownedHandles),
      waitForTurn: async () => {
        turns += 1
        if (turns === 1) {
          tcpSockets += 1
          poolTotal += 1
          poolIdle += 1
          const poolSocket = {}
          tcpHandles.push(poolSocket)
          ownedHandles.push(poolSocket)
        } else if (turns === 2) {
          tcpSockets += 1
          tcpHandles.push({})
        }
      },
    })

    expect(result.coalesced).toBe(false)
    const recorded = recordForkLeakCheckpoint(
      counts => [counts.get('TCPSocketWrap')],
      result,
      'growth.test.mts',
    )
    expect(recorded).toEqual([6])
  })

  it('preserves a stable but nonzero ConnectWrap instead of coalescing it', async () => {
    let turns = 0
    const tcpSocket = {}
    const result = await waitForForkLeakHandshakeSettle({
      readResources: () => ['ConnectWrap', 'TCPSocketWrap'],
      readPsqlPoolMetrics: () => poolMetrics(1, 0),
      readPsqlPoolSocketHandles: () => socketHandles([tcpSocket], [tcpSocket]),
      stableObservations: 2,
      maxTurns: 100,
      waitForTurn: async () => {
        turns += 1
      },
    })

    expect(turns).toBe(2)
    expect(result.coalesced).toBe(false)
    expect(result.snapshot).toMatchObject({ connectWraps: 1, tcpSockets: 1 })
    expect(result.observations).toHaveLength(4)
  })

  it('records one actual resource snapshot for a completed test', () => {
    const makeSnapshot = (
      tcpSockets: number,
      extraResources: readonly string[] = [],
    ): ForkLeakHandshakeSnapshot => ({
      connectWraps: 0,
      tcpSockets,
      resources: [...Array.from({ length: tcpSockets }, () => 'TCPSocketWrap'), ...extraResources],
      tcpSocketHandles: new Set(),
      psqlPoolMetrics: null,
    })
    const settlement: ForkLeakHandshakeSettlement = {
      snapshot: makeSnapshot(8),
      detectorSnapshot: makeSnapshot(4),
      observations: [makeSnapshot(2, ['PipeWrap', 'PipeWrap']), makeSnapshot(4), makeSnapshot(8)],
      coalesced: false,
    }
    let recordCalls = 0

    const result = recordForkLeakCheckpoint(
      (counts, testFile) => {
        recordCalls += 1
        return [{ counts, testFile }]
      },
      settlement,
      'one.test.mts',
    )

    expect(recordCalls).toBe(1)
    expect(result).toEqual([{ counts: new Map([['TCPSocketWrap', 4]]), testFile: 'one.test.mts' }])

    const settledResult = recordForkLeakCheckpoint(
      (counts, testFile) => {
        recordCalls += 1
        return [{ counts, testFile }]
      },
      { ...settlement, coalesced: true },
      'settled.test.mts',
    )
    expect(recordCalls).toBe(2)
    expect(settledResult).toEqual([
      { counts: new Map([['TCPSocketWrap', 8]]), testFile: 'settled.test.mts' },
    ])
  })

  it('returns the latest raw checkpoint when a pool transition reaches the turn cap', async () => {
    let tcpSockets = 1
    let poolTotal = 1
    const tcpHandles = [{}]
    const ownedHandles = [...tcpHandles]
    const result = await waitForForkLeakHandshakeSettle({
      readResources: () => [
        ...Array.from({ length: tcpSockets }, () => 'TCPSocketWrap'),
        'ConnectWrap',
      ],
      readPsqlPoolMetrics: () => poolMetrics(poolTotal, 0),
      readPsqlPoolSocketHandles: () => socketHandles(tcpHandles, ownedHandles),
      maxTurns: 3,
      waitForTurn: async () => {
        tcpSockets += 1
        poolTotal += 1
        const socketHandle = {}
        tcpHandles.push(socketHandle)
        ownedHandles.push(socketHandle)
      },
    })

    expect(result.coalesced).toBe(false)
    expect(result.snapshot.tcpSockets).toBe(4)
    expect(
      recordForkLeakCheckpoint(counts => [counts.get('TCPSocketWrap')], result, 'cap.test.mts'),
    ).toEqual([4])
    expect(result.observations).toHaveLength(5)
  })

  it('flags the unsmoothed merge-queue ramp and absorbs the same sockets as one settled jump', () => {
    expect(
      recordAll(createForkLeakDetector(), [0, 0, 0, 0, 0, 0, 0, 0, 2, 4, 5, 5, 5, 6, 7, 8])[0],
    ).toMatchObject({
      baseline: 0,
      current: 8,
      streak: 5,
      growthCheckpoints: 3,
      suspectedGrowth: { previous: 4, current: 5, delta: 1 },
    })
    expect(recordAll(createForkLeakDetector(), [0, 0, 0, 0, 0, 8, 8, 8, 8, 8, 8])).toEqual([])
  })
})
