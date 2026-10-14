import { waitForResourceCloseCallbacks } from 'vouchington-tooling/vitest-diagnostics'
import { countResourcesByType } from './vitest-process-resources.mts'

// Two quiet event-loop turns: enough for a serial pool handshake to start its
// next socket before we treat the count as settled, and short enough that every
// fork-leak afterEach can pay it. The turn cap stops a socket that stays in
// ConnectWrap from holding the hook until hookTimeout.
export const FORK_LEAK_HANDSHAKE_STABLE_OBSERVATIONS = 2
export const FORK_LEAK_HANDSHAKE_MAX_TURNS = 100

export type ForkLeakHandshakeSnapshot = {
  connectWraps: number
  tcpSockets: number
}

function handshakeSnapshot(resources: readonly string[]): ForkLeakHandshakeSnapshot {
  const counts = countResourcesByType(resources)
  return {
    connectWraps: counts.get('ConnectWrap') ?? 0,
    tcpSockets: counts.get('TCPSocketWrap') ?? 0,
  }
}

function handshakeSettled(
  previous: ForkLeakHandshakeSnapshot,
  current: ForkLeakHandshakeSnapshot,
): boolean {
  return (
    current.connectWraps === 0 &&
    previous.connectWraps === current.connectWraps &&
    previous.tcpSockets === current.tcpSockets
  )
}

// A finite PostgreSQL pool ramp opens sockets one handshake at a time. Sampled
// once per test, that ramp is continued growth. Waiting until ConnectWrap is
// gone and the TCPSocketWrap count stops changing records the ramp as one jump,
// which the detector already absorbs. A later test that opens another socket
// still advances the episode.
export async function waitForForkLeakHandshakeSettle(options: {
  readResources: () => readonly string[]
  waitForTurn?: () => Promise<void>
  stableObservations?: number
  maxTurns?: number
}): Promise<ForkLeakHandshakeSnapshot> {
  const waitForTurn = options.waitForTurn ?? waitForResourceCloseCallbacks
  const stableObservations = options.stableObservations ?? FORK_LEAK_HANDSHAKE_STABLE_OBSERVATIONS
  const maxTurns = options.maxTurns ?? FORK_LEAK_HANDSHAKE_MAX_TURNS
  let previous = handshakeSnapshot(options.readResources())
  let stable = 0
  for (let turn = 0; turn < maxTurns && stable < stableObservations; turn += 1) {
    await waitForTurn()
    const current = handshakeSnapshot(options.readResources())
    stable = handshakeSettled(previous, current) ? stable + 1 : 0
    previous = current
  }
  return previous
}
