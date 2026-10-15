import { waitForResourceCloseCallbacks } from 'vouchington-tooling/vitest-diagnostics'
import type { PsqlPoolMetrics, PsqlPoolSocketHandles } from '@data-stores/psql/pool-metrics'
import { countResourcesByType } from './vitest-process-resources.mts'

// Two quiet event-loop turns settle a completed pool transition. The hard cap
// bounds slow handshakes; unresolved sockets keep every sampled checkpoint.
export const FORK_LEAK_HANDSHAKE_STABLE_OBSERVATIONS = 2
export const FORK_LEAK_HANDSHAKE_MAX_TURNS = 100

export type ForkLeakHandshakeSnapshot = {
  connectWraps: number
  tcpSockets: number
  resources: readonly string[]
  tcpSocketHandles: ReadonlySet<object>
  psqlPoolMetrics: PsqlPoolMetrics | null
}

type PoolConnectionCounts = {
  total: number
  idle: number
  nonIdleOrConnecting: number
  waiting: number
}

function handshakeSnapshot(
  resources: readonly string[],
  tcpSocketHandles: ReadonlySet<object>,
  psqlPoolMetrics: PsqlPoolMetrics | null,
): ForkLeakHandshakeSnapshot {
  const counts = countResourcesByType(resources)
  return {
    connectWraps: counts.get('ConnectWrap') ?? 0,
    tcpSockets: counts.get('TCPSocketWrap') ?? 0,
    resources,
    tcpSocketHandles,
    psqlPoolMetrics,
  }
}

function poolConnectionCounts(metrics: PsqlPoolMetrics): PoolConnectionCounts {
  return {
    total: metrics.write.total + metrics.read.total + metrics.advisoryLock.total,
    idle: metrics.write.idle + metrics.read.idle + metrics.advisoryLock.idle,
    nonIdleOrConnecting:
      metrics.write.nonIdleOrConnecting +
      metrics.read.nonIdleOrConnecting +
      metrics.advisoryLock.nonIdleOrConnecting,
    waiting: metrics.write.waiting + metrics.read.waiting + metrics.advisoryLock.waiting,
  }
}

function samePoolCounts(previous: PoolConnectionCounts, current: PoolConnectionCounts): boolean {
  return (
    previous.total === current.total &&
    previous.idle === current.idle &&
    previous.nonIdleOrConnecting === current.nonIdleOrConnecting &&
    previous.waiting === current.waiting
  )
}

function handshakeSettled(
  previous: ForkLeakHandshakeSnapshot,
  current: ForkLeakHandshakeSnapshot,
): boolean {
  return (
    previous.connectWraps === current.connectWraps && previous.tcpSockets === current.tcpSockets
  )
}

// A finite PostgreSQL pool ramp is coalesced only when the async resource
// identities show that every new TCP socket belongs to a registered pool.
// Unowned or unresolved growth returns its complete sample history to the
// detector, so equal aggregate counts cannot hide a simultaneous test socket.
export async function waitForForkLeakHandshakeSettle(options: {
  readResources: () => readonly string[]
  readPsqlPoolMetrics: () => PsqlPoolMetrics | null
  readPsqlPoolSocketHandles: () => PsqlPoolSocketHandles | null
  waitForTurn?: () => Promise<void>
  stableObservations?: number
  maxTurns?: number
}): Promise<{
  snapshot: ForkLeakHandshakeSnapshot
  observations: readonly ForkLeakHandshakeSnapshot[]
  coalesced: boolean
}> {
  const waitForTurn = options.waitForTurn ?? waitForResourceCloseCallbacks
  const stableObservations = options.stableObservations ?? FORK_LEAK_HANDSHAKE_STABLE_OBSERVATIONS
  const maxTurns = options.maxTurns ?? FORK_LEAK_HANDSHAKE_MAX_TURNS
  const initialMetrics = options.readPsqlPoolMetrics()
  const initialHandles = options.readPsqlPoolSocketHandles()
  const initial = handshakeSnapshot(
    options.readResources(),
    initialHandles?.active ?? new Set(),
    initialMetrics,
  )
  if (initial.connectWraps === 0 || initialMetrics === null || initialHandles === null) {
    return { snapshot: initial, observations: [initial], coalesced: false }
  }

  const initialPool = poolConnectionCounts(initialMetrics)
  if (initialPool.nonIdleOrConnecting === 0) {
    return { snapshot: initial, observations: [initial], coalesced: false }
  }

  let previous = initial
  let previousPool = initialPool
  let stable = 0
  const observations = [initial]
  const ownedHandlesObserved = new Set(initialHandles.owned)
  for (let turn = 0; turn < maxTurns && stable < stableObservations; turn += 1) {
    await waitForTurn()
    const currentHandles = options.readPsqlPoolSocketHandles()
    const currentMetrics = options.readPsqlPoolMetrics()
    const current = handshakeSnapshot(
      options.readResources(),
      currentHandles?.active ?? new Set(),
      currentMetrics,
    )
    observations.push(current)
    if (currentMetrics === null || currentHandles === null) {
      return { snapshot: current, observations, coalesced: false }
    }
    for (const handle of currentHandles.owned) ownedHandlesObserved.add(handle)
    const currentPool = poolConnectionCounts(currentMetrics)
    stable =
      handshakeSettled(previous, current) && samePoolCounts(previousPool, currentPool)
        ? stable + 1
        : 0
    previous = current
    previousPool = currentPool
    if (stable >= stableObservations) {
      const initialTcpHandles = initial.tcpSocketHandles
      const observedGrowthHandles = new Set(
        observations.flatMap(observation =>
          [...observation.tcpSocketHandles].filter(handle => !initialTcpHandles.has(handle)),
        ),
      )
      const tcpCountGrowth = current.tcpSockets - initial.tcpSockets
      const identitiesAccountForAllGrowth =
        tcpCountGrowth <= 0 || observedGrowthHandles.size === tcpCountGrowth
      const allGrowthIsPoolOwned =
        identitiesAccountForAllGrowth &&
        [...observedGrowthHandles].every(handle => ownedHandlesObserved.has(handle))
      return { snapshot: current, observations, coalesced: allGrowthIsPoolOwned }
    }
  }

  return { snapshot: previous, observations, coalesced: false }
}
