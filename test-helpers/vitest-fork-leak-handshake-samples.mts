import { countResourcesByType } from './vitest-process-resources.mts'

export type PsqlPoolMetrics = {
  write: PoolConnectionMetrics
  read: PoolConnectionMetrics
  advisoryLock: PoolConnectionMetrics
  jobSerialization: PoolConnectionMetrics
}

type PoolConnectionMetrics = {
  total: number
  idle: number
  nonIdleOrConnecting: number
  waiting: number
}

export type PsqlPoolSocketHandles = { active: ReadonlySet<object>; owned: ReadonlySet<object> }

const pendingEpisodeKey = Symbol.for('vitest-fork-leak-pending-pool-socket-episodes')
const pendingEpisodeGlobal = globalThis as typeof globalThis &
  Record<symbol, WeakSet<object> | undefined>
const pendingEpisodes = pendingEpisodeGlobal[pendingEpisodeKey] ?? new WeakSet<object>()
pendingEpisodeGlobal[pendingEpisodeKey] = pendingEpisodes

function startPendingPoolSocketEpisode(
  growthHandles: readonly object[],
  ownedHandles: ReadonlySet<object>,
): object | null {
  const candidate = growthHandles.find(
    handle => !ownedHandles.has(handle) && !pendingEpisodes.has(handle),
  )
  if (candidate) pendingEpisodes.add(candidate)
  return candidate ?? null
}

export function pendingPoolSocketEpisode(options: {
  initial: ForkLeakHandshakeSnapshot
  probe: ForkLeakHandshakeSnapshot
  current: ForkLeakHandshakeSnapshot
  initialPool: PoolConnectionCounts
  currentPool: PoolConnectionCounts
  ownedHandlesObserved: ReadonlySet<object>
  previousHandle: object | null
}): { handle: object | null; inFlight: boolean } {
  const growthHandles = [...options.current.tcpSocketHandles].filter(
    handle => !options.initial.tcpSocketHandles.has(handle),
  )
  const capacity = Math.max(0, options.currentPool.total - options.initialPool.total)
  const newlyOwned = growthHandles.filter(handle => options.ownedHandlesObserved.has(handle)).length
  const initialUnowned = [...options.initial.tcpSocketHandles].filter(
    handle => !options.ownedHandlesObserved.has(handle),
  )
  const initialPending = options.currentPool.nonIdleOrConnecting > 0 && initialUnowned.length > 0
  const newPending = options.currentPool.nonIdleOrConnecting > 0 && newlyOwned < capacity
  const candidates = newPending
    ? growthHandles
    : initialPending
      ? [...options.current.tcpSocketHandles].filter(handle =>
          options.initial.tcpSocketHandles.has(handle),
        )
      : []
  const handle =
    startPendingPoolSocketEpisode(candidates, options.ownedHandlesObserved) ??
    options.previousHandle
  return {
    handle,
    inFlight:
      handle !== null &&
      options.current.tcpSocketHandles.has(handle) &&
      !options.ownedHandlesObserved.has(handle),
  }
}

export type ForkLeakHandshakeSnapshot = {
  connectWraps: number
  tcpSockets: number
  resources: readonly string[]
  tcpSocketHandles: ReadonlySet<object>
  psqlPoolMetrics: PsqlPoolMetrics | null
}

export function recordForkLeakCheckpoint<T>(
  record: (counts: ReadonlyMap<string, number>, testFile: string) => T[],
  settlement: {
    snapshot: ForkLeakHandshakeSnapshot
    detectorSnapshot: ForkLeakHandshakeSnapshot
    coalesced: boolean
  },
  testFile: string,
): T[] {
  const checkpoint = settlement.coalesced ? settlement.snapshot : settlement.detectorSnapshot
  return record(countResourcesByType(checkpoint.resources), testFile)
}

export type PoolConnectionCounts = {
  total: number
  idle: number
  nonIdleOrConnecting: number
  waiting: number
}

export function handshakeSnapshot(
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

export function poolConnectionCounts(metrics: PsqlPoolMetrics): PoolConnectionCounts {
  return {
    total:
      metrics.write.total +
      metrics.read.total +
      metrics.advisoryLock.total +
      metrics.jobSerialization.total,
    idle:
      metrics.write.idle +
      metrics.read.idle +
      metrics.advisoryLock.idle +
      metrics.jobSerialization.idle,
    nonIdleOrConnecting:
      metrics.write.nonIdleOrConnecting +
      metrics.read.nonIdleOrConnecting +
      metrics.advisoryLock.nonIdleOrConnecting +
      metrics.jobSerialization.nonIdleOrConnecting,
    waiting:
      metrics.write.waiting +
      metrics.read.waiting +
      metrics.advisoryLock.waiting +
      metrics.jobSerialization.waiting,
  }
}

export function samePoolCounts(
  previous: PoolConnectionCounts,
  current: PoolConnectionCounts,
): boolean {
  return (
    previous.total === current.total &&
    previous.idle === current.idle &&
    previous.nonIdleOrConnecting === current.nonIdleOrConnecting &&
    previous.waiting === current.waiting
  )
}

export function handshakeSettled(
  previous: ForkLeakHandshakeSnapshot,
  current: ForkLeakHandshakeSnapshot,
): boolean {
  return (
    previous.connectWraps === current.connectWraps && previous.tcpSockets === current.tcpSockets
  )
}

export function rawDetectorCheckpoint(options: {
  current: ForkLeakHandshakeSnapshot
  ownedHandlesObserved: ReadonlySet<object>
  unownedGrowthSnapshots: ReadonlyMap<object, ForkLeakHandshakeSnapshot>
}): ForkLeakHandshakeSnapshot {
  const firstUnresolvedSample = [...options.unownedGrowthSnapshots].find(
    ([handle]) => !options.ownedHandlesObserved.has(handle),
  )?.[1]
  return firstUnresolvedSample ?? options.current
}
