import { describe, expect, it } from 'vitest'
import { createForkLeakDetector } from 'vouchington-tooling/vitest-diagnostics'
import { waitForForkLeakHandshakeSettle } from './vitest-fork-leak-handshake.mts'

function recordAll(detector: ReturnType<typeof createForkLeakDetector>, counts: readonly number[]) {
  return counts.flatMap(count => detector.record(new Map([['TCPSocketWrap', count]])))
}

describe('fork-leak handshake settlement', () => {
  it('coalesces a serial TCP handshake burst into the settled socket count', async () => {
    let tcpSockets = 4
    let connectWraps = 1
    const readResources = () => [
      ...Array.from({ length: tcpSockets }, () => 'TCPSocketWrap'),
      ...Array.from({ length: connectWraps }, () => 'ConnectWrap'),
    ]
    const snapshot = await waitForForkLeakHandshakeSettle({
      readResources,
      stableObservations: 2,
      maxTurns: 20,
      waitForTurn: async () => {
        if (tcpSockets < 8) {
          tcpSockets += 1
          connectWraps = 1
          return
        }
        connectWraps = 0
      },
    })

    expect(snapshot).toEqual({ connectWraps: 0, tcpSockets: 8 })
  })

  it('returns the still-connecting snapshot when the turn bound is exhausted', async () => {
    let turns = 0
    const snapshot = await waitForForkLeakHandshakeSettle({
      readResources: () => ['ConnectWrap', 'TCPSocketWrap'],
      stableObservations: 2,
      maxTurns: 3,
      waitForTurn: async () => {
        turns += 1
      },
    })

    expect(turns).toBe(3)
    expect(snapshot).toEqual({ connectWraps: 1, tcpSockets: 1 })
  })

  it('flags the unsmoothed merge-queue ramp and absorbs the same sockets as one settled jump', () => {
    // Backend merge-group run 38610286815: warmup baseline 0, then TCPSocketWrap
    // climbed through 4 -> 5 while one ConnectWrap was still opening, and the
    // detector confirmed at 8. Those sockets were the write and read pools.
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
