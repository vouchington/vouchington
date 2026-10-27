import { describe, expect, it, vi } from 'vitest'
import { createServer, connect } from 'node:net'
import {
  advisoryLockPool,
  jobSerializationPool,
  readPool,
  writePool,
} from '../data-stores/psql/setup.mts'

import type { PsqlPoolSocketHandles } from './psql-pool-metrics.mts'

describe('PostgreSQL pool metrics', () => {
  it('reports the initialized write, read, advisory, and job serialization pools', () => {
    const metricsProvider = (
      globalThis as typeof globalThis & Record<symbol, (() => unknown) | undefined>
    )[Symbol.for('vitest-fork-leak-pool-metrics')]
    expect(metricsProvider?.()).toMatchObject({
      write: expectedPoolMetrics(writePool),
      read: expectedPoolMetrics(readPool),
      advisoryLock: expectedPoolMetrics(advisoryLockPool),
      jobSerialization: expectedPoolMetrics(jobSerializationPool),
    })
  })

  it('tracks the real pool socket without claiming an unrelated net.Socket', async () => {
    const client = await writePool.connect()
    const serializationClient = await jobSerializationPool.connect()
    const server = createServer(socket => socket.on('error', () => undefined))
    const acceptedSockets = new Set<import('node:net').Socket>()
    let unrelatedSocket: import('node:net').Socket | undefined
    server.on('connection', socket => acceptedSockets.add(socket))

    try {
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
      const poolHandle = Reflect.get(Reflect.get(client, 'connection').stream, '_handle') as object
      const serializationHandle = Reflect.get(
        Reflect.get(serializationClient, 'connection').stream,
        '_handle',
      ) as object
      const before = getRegisteredPsqlPoolSocketHandles()
      expect(before?.active.has(poolHandle)).toBe(true)
      expect(before?.owned.has(poolHandle)).toBe(true)
      expect(before?.active.has(serializationHandle)).toBe(true)
      expect(before?.owned.has(serializationHandle)).toBe(true)

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
      expect(after?.active.has(serializationHandle)).toBe(true)
      expect(after?.owned.has(serializationHandle)).toBe(true)
      expect(after?.active.has(unrelatedHandle)).toBe(true)
      expect(after?.owned.has(unrelatedHandle)).toBe(false)
    } finally {
      unrelatedSocket?.destroy()
      client.release()
      serializationClient.release()
      for (const socket of acceptedSockets) socket.destroy()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })
  it('recognizes connected pools from a reset module graph without duplicate listeners', async () => {
    vi.resetModules()
    const runtime = await import('../data-stores/psql/runtime.mts')
    const client = await runtime.jobSerializationPool.connect()
    try {
      const handle = Reflect.get(Reflect.get(client, 'connection').stream, '_handle') as object
      const { registerCurrentPsqlPoolMetrics } = await import('./psql-pool-metrics.mts')
      await registerCurrentPsqlPoolMetrics()
      const listeners = runtime.jobSerializationPool.listenerCount('connect')
      await registerCurrentPsqlPoolMetrics()
      expect(getRegisteredPsqlPoolSocketHandles()?.active.has(handle)).toBe(true)
      expect(getRegisteredPsqlPoolSocketHandles()?.owned.has(handle)).toBe(true)
      expect(runtime.jobSerializationPool.listenerCount('connect')).toBe(listeners)
    } finally {
      client.release()
      await runtime.close()
      vi.resetModules()
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
  )[Symbol.for('vitest-fork-leak-pool-socket-handles')]
  return provider?.() ?? null
}
