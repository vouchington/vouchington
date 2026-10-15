import { createHook } from 'node:async_hooks'
import type pg from 'pg'

export type PsqlPoolMetric = {
  total: number
  idle: number
  nonIdleOrConnecting: number
  waiting: number
}

export type PsqlPoolMetrics = {
  write: PsqlPoolMetric
  read: PsqlPoolMetric
  advisoryLock: PsqlPoolMetric
}

type PsqlPoolMetricsProvider = () => PsqlPoolMetrics
export type PsqlPoolSocketHandles = {
  active: ReadonlySet<object>
  owned: ReadonlySet<object>
}
type PsqlPoolSocketHandlesProvider = () => PsqlPoolSocketHandles

type TcpResourceTracker = {
  active: Map<number, object>
  owned: WeakSet<object>
  registeredPools: WeakSet<object>
  hookInstalled: boolean
}

const trackerKey = Symbol.for('vitest-fork-leak-tcp-resource-tracker')
const trackerGlobal = globalThis as typeof globalThis &
  Record<symbol, TcpResourceTracker | undefined>
const tcpResourceTracker = trackerGlobal[trackerKey] ?? {
  active: new Map(),
  owned: new WeakSet(),
  registeredPools: new WeakSet(),
  hookInstalled: false,
}
trackerGlobal[trackerKey] = tcpResourceTracker

export function registerPsqlPoolMetricsForTestEnvironment(
  pools: PsqlPools,
  environment: string | undefined,
): boolean {
  if (environment !== 'test') return false

  installTcpResourceHook()
  for (const pool of [pools.write, pools.read, pools.advisoryLock]) {
    if (tcpResourceTracker.registeredPools.has(pool)) continue
    tcpResourceTracker.registeredPools.add(pool)
    pool.on('connect', client => markPoolTcpResource(client))
  }

  const target = globalThis as typeof globalThis & Record<symbol, PsqlPoolMetricsProvider>
  target[psqlPoolMetricsKey()] = () => ({
    write: snapshotPool(pools.write),
    read: snapshotPool(pools.read),
    advisoryLock: snapshotPool(pools.advisoryLock),
  })
  ;(globalThis as typeof globalThis & Record<symbol, PsqlPoolSocketHandlesProvider>)[
    psqlPoolSocketHandlesKey()
  ] = () => {
    const active = new Set(tcpResourceTracker.active.values())
    return {
      active,
      owned: new Set([...active].filter(resource => tcpResourceTracker.owned.has(resource))),
    }
  }
  return true
}

type PsqlPools = {
  write: pg.Pool
  read: pg.Pool
  advisoryLock: pg.Pool
}

function installTcpResourceHook(): void {
  if (tcpResourceTracker.hookInstalled) return
  tcpResourceTracker.hookInstalled = true
  createHook({
    init(asyncId, type, _triggerAsyncId, resource) {
      if (type === 'TCPWRAP' && typeof resource === 'object' && resource !== null) {
        tcpResourceTracker.active.set(asyncId, resource)
      }
    },
    destroy(asyncId) {
      tcpResourceTracker.active.delete(asyncId)
    },
  }).enable()
}

function markPoolTcpResource(client: pg.PoolClient | undefined): void {
  if (typeof client !== 'object' || client === null) return
  const connection = Reflect.get(client, 'connection')
  if (typeof connection !== 'object' || connection === null) return
  const stream = Reflect.get(connection, 'stream')
  if (typeof stream !== 'object' || stream === null) return
  const streamHandle = Reflect.get(stream, '_handle')
  // Coalescing requires this exact handle to appear in the async resource map.
  // TLS/custom streams without a matching TCPWRAP identity stay unowned.
  if (typeof streamHandle === 'object' && streamHandle !== null) {
    tcpResourceTracker.owned.add(streamHandle)
  }
}

function snapshotPool(pool: pg.Pool): PsqlPoolMetric {
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    nonIdleOrConnecting: pool.totalCount - pool.idleCount,
    waiting: pool.waitingCount,
  }
}

function psqlPoolMetricsKey(): symbol {
  return Symbol.for('vitest-fork-leak-psql-pool-metrics')
}

function psqlPoolSocketHandlesKey(): symbol {
  return Symbol.for('vitest-fork-leak-psql-pool-socket-handles')
}
