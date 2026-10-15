import { describe, expect, it } from 'vitest'
import { createServer, connect } from 'node:net'
import { advisoryLockPool, readPool, writePool } from './setup.mts'

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
})

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
