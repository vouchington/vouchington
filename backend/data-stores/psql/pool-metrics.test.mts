import { describe, expect, it } from 'vitest'
import { createServer, connect } from 'node:net'
import { Pool, type PoolClient } from 'pg'
import { advisoryLockPool, readPool, writePool } from './setup.mts'
import { registerPsqlPoolMetricsForTestEnvironment, type PsqlPoolMetrics } from './pool-metrics.mts'
import { waitForForkLeakHandshakeSettle } from '../../../test-helpers/vitest-fork-leak-handshake.mts'

type PsqlPoolSocketHandles = { active: ReadonlySet<object>; owned: ReadonlySet<object> }

describe('PostgreSQL pool metrics', () => {
  it('reports the initialized write, read, and advisory pools', () => {
    const metricsProvider = (
      globalThis as typeof globalThis & Record<symbol, (() => unknown) | undefined>
    )[Symbol.for('vitest-fork-leak-psql-pool-metrics')]
    expect(metricsProvider?.()).toMatchObject({
      write: expectedPoolMetrics(writePool),
      read: expectedPoolMetrics(readPool),
      advisoryLock: expectedPoolMetrics(advisoryLockPool),
    })
  })

  it('tracks the real pool socket without claiming an unrelated net.Socket', async () => {
    const client = await writePool.connect()
    const server = createServer(socket => socket.on('error', () => undefined))
    const acceptedSockets = new Set<import('node:net').Socket>()
    let unrelatedSocket: import('node:net').Socket | undefined
    server.on('connection', socket => acceptedSockets.add(socket))

    try {
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
      const poolHandle = Reflect.get(Reflect.get(client, 'connection').stream, '_handle') as object
      const before = getRegisteredPsqlPoolSocketHandles()
      expect(before?.active.has(poolHandle)).toBe(true)
      expect(before?.owned.has(poolHandle)).toBe(true)

      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('TCP server has no address')
      unrelatedSocket = connect(address.port, '127.0.0.1')
      await new Promise<void>((resolve, reject) => {
        unrelatedSocket!.once('connect', resolve)
        unrelatedSocket!.once('error', reject)
      })

      const after = getRegisteredPsqlPoolSocketHandles()
      const unrelatedHandle = Reflect.get(unrelatedSocket, '_handle') as object
      expect(after?.active.has(poolHandle)).toBe(true)
      expect(after?.owned.has(poolHandle)).toBe(true)
      expect(after?.active.has(unrelatedHandle)).toBe(true)
      expect(after?.owned.has(unrelatedHandle)).toBe(false)
    } finally {
      unrelatedSocket?.destroy()
      client.release()
      for (const socket of acceptedSockets) socket.destroy()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })

  it('coalesces a real initialized PostgreSQL pool connection after its handshake completes', async () => {
    const pool = new Pool({ ...writePool.options, max: 2, idleTimeoutMillis: 0 })
    const target = globalThis as typeof globalThis & Record<symbol, unknown>
    const metricsKey = Symbol.for('vitest-fork-leak-psql-pool-metrics')
    const handlesKey = Symbol.for('vitest-fork-leak-psql-pool-socket-handles')
    const previousMetricsProvider = target[metricsKey]
    const previousHandlesProvider = target[handlesKey]
    let client: PoolClient | undefined
    let secondClient: PoolClient | undefined
    let secondConnection: Promise<PoolClient> | undefined

    registerPsqlPoolMetricsForTestEnvironment(
      { write: pool, read: readPool, advisoryLock: advisoryLockPool },
      'test',
    )

    try {
      const readResources = () => process.getActiveResourcesInfo()
      const readPsqlPoolMetrics = () => {
        const provider = target[metricsKey]
        return typeof provider === 'function' ? (provider as () => PsqlPoolMetrics)() : null
      }
      const readPsqlPoolSocketHandles = () => {
        const provider = target[handlesKey]
        return typeof provider === 'function'
          ? (
              provider as () => {
                active: ReadonlySet<object>
                owned: ReadonlySet<object>
              }
            )()
          : null
      }
      const firstConnection = pool.connect()
      const waitForTurn = (globalThis as typeof globalThis & Record<symbol, unknown>)[
        Symbol.for('vitest-fork-leak-resource-close-callback-wait')
      ]
      if (typeof waitForTurn !== 'function') {
        throw new Error('The fork leak setup did not register its callback wait')
      }
      const settlement = waitForForkLeakHandshakeSettle({
        readResources,
        readPsqlPoolMetrics,
        readPsqlPoolSocketHandles,
        waitForTurn: async () => {
          if (!secondConnection) secondConnection = pool.connect()
          // The positive control owns a completed handshake, not a race against the sampler's cap.
          await secondConnection
          await (waitForTurn as () => Promise<void>)()
        },
      })
      const firstClient = await firstConnection
      client = firstClient
      const result = await settlement
      if (!secondConnection) throw new Error('The second PostgreSQL connection was not started')
      const completedSecondClient = await secondConnection
      secondClient = completedSecondClient
      const poolHandles = [firstClient, completedSecondClient].map(
        connectionClient =>
          Reflect.get(Reflect.get(connectionClient, 'connection').stream, '_handle') as object,
      )
      const currentHandles = readPsqlPoolSocketHandles()
      const baselineHandles = result.observations[0]?.tcpSocketHandles
      const growthHandles = [...result.snapshot.tcpSocketHandles].filter(
        handle => !baselineHandles?.has(handle),
      )
      const diagnostics = {
        observationCount: result.observations.length,
        observations: result.observations.map((observation, index) => {
          return {
            index,
            tcpSockets: observation.tcpSockets,
            connectWraps: observation.connectWraps,
            tcpHandleCount: observation.tcpSocketHandles.size,
            ownedAtEndCount: [...observation.tcpSocketHandles].filter(handle =>
              currentHandles?.owned.has(handle),
            ).length,
            pools: observation.psqlPoolMetrics,
          }
        }),
        poolHandles: poolHandles.map(handle => ({
          inSnapshot: result.snapshot.tcpSocketHandles.has(handle),
          active: currentHandles?.active.has(handle) ?? false,
          owned: currentHandles?.owned.has(handle) ?? false,
        })),
      }
      if (!result.coalesced) console.error('Pool handshake observations', diagnostics)
      expect(result.coalesced).toBe(true)
      expect(growthHandles).toContain(poolHandles[1])
      expect(growthHandles.every(handle => currentHandles?.owned.has(handle))).toBe(true)
      for (const poolHandle of poolHandles) {
        expect(result.snapshot.tcpSocketHandles.has(poolHandle)).toBe(true)
      }
    } finally {
      client?.release()
      secondClient?.release()
      if (!secondClient && secondConnection) {
        await secondConnection.then(
          pendingClient => pendingClient.release(),
          () => undefined,
        )
      }
      await pool.end()
      restoreGlobalProvider(target, metricsKey, previousMetricsProvider)
      restoreGlobalProvider(target, handlesKey, previousHandlesProvider)
    }
  })
})

function restoreGlobalProvider(
  target: typeof globalThis & Record<symbol, unknown>,
  key: symbol,
  previous: unknown,
): void {
  if (previous === undefined) delete target[key]
  else target[key] = previous
}

function expectedPoolMetrics(pool: import('pg').Pool) {
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    nonIdleOrConnecting: pool.totalCount - pool.idleCount,
    waiting: pool.waitingCount,
  }
}

function getRegisteredPsqlPoolSocketHandles(): PsqlPoolSocketHandles | null {
  const provider = (
    globalThis as typeof globalThis & Record<symbol, (() => PsqlPoolSocketHandles) | undefined>
  )[Symbol.for('vitest-fork-leak-psql-pool-socket-handles')]
  return provider?.() ?? null
}
