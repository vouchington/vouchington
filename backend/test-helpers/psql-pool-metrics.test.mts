import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { createServer, connect } from 'node:net'
import {
  advisoryLockPool,
  jobSerializationPool,
  readPool,
  writePool,
} from '../data-stores/psql/setup.mts'
import { createTestPostgresMultiWait } from './postgres-multi-client-lock-observer.mts'

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

  it('releases both holders and restores pools and client settings after a bad snapshot', async () => {
    const firstKey = `multi-lock-first-${crypto.randomUUID()}`
    const secondKey = `multi-lock-second-${crypto.randomUUID()}`
    const firstHolder = await holdAdvisoryLock(firstKey)
    onTestFinished(async () => firstHolder.release())
    const secondHolder = await holdAdvisoryLock(secondKey)
    onTestFinished(async () => secondHolder.release())
    const writeConnect = Object.getOwnPropertyDescriptor(writePool, 'connect')
    const advisoryConnect = Object.getOwnPropertyDescriptor(advisoryLockPool, 'connect')
    const owner = await createTestPostgresMultiWait()
    let firstOperation: Promise<unknown> | undefined
    let secondOperation: Promise<unknown> | undefined

    try {
      const first = await owner.start(
        {
          pool: 'write',
          holderProcessId: firstHolder.processId,
          lock: { kind: 'advisory', key: firstKey },
          queryMarker: 'multiLockFirstWaiter',
          releaseHolder: firstHolder.release,
        },
        () => waitOnAdvisoryLock(firstKey, 'multiLockFirstWaiter'),
      )
      firstOperation = first.operation
      await first.waitForLock()

      const second = await owner.start(
        {
          pool: 'write',
          holderProcessId: secondHolder.processId,
          lock: { kind: 'advisory', key: secondKey },
          queryMarker: 'markerThatDoesNotMatchSecondWaiter',
          releaseHolder: secondHolder.release,
        },
        () => waitOnAdvisoryLock(secondKey, 'multiLockSecondWaiter'),
      )
      secondOperation = second.operation
      await expect(second.waitForLock()).rejects.toThrow(
        'Native lock notice did not match the owned holder and real query',
      )
    } finally {
      try {
        await owner[Symbol.asyncDispose]()
      } finally {
        await Promise.allSettled([firstHolder.release(), secondHolder.release()])
      }
    }

    if (firstOperation === undefined || secondOperation === undefined)
      throw new Error('Owned actions did not return their blocked operations')
    await expect(Promise.all([firstOperation, secondOperation])).resolves.toHaveLength(2)
    expect(firstHolder.released).toBe(true)
    expect(secondHolder.released).toBe(true)
    expect(Object.getOwnPropertyDescriptor(writePool, 'connect')).toEqual(writeConnect)
    expect(Object.getOwnPropertyDescriptor(advisoryLockPool, 'connect')).toEqual(advisoryConnect)
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

async function holdAdvisoryLock(key: string) {
  const client = await writePool.connect()
  let processId: number
  try {
    const { rows } = await client.query<{ process_id: number }>(
      'SELECT pg_backend_pid()::integer AS process_id',
    )
    const pid = rows[0]?.process_id
    if (pid === undefined) throw new Error('PostgreSQL did not return a backend process ID')
    processId = pid
    await client.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [key])
  } catch (err) {
    client.release(toError(err))
    throw err
  }
  let released: Promise<void> | undefined
  return {
    processId,
    get released() {
      return released !== undefined
    },
    release() {
      return (released ??= (async () => {
        try {
          const result = await client.query<{ unlocked: boolean }>(
            'SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked',
            [key],
          )
          if (!result.rows[0]?.unlocked)
            throw new Error('PostgreSQL did not release the test advisory lock')
          client.release()
        } catch (err) {
          client.release(toError(err))
          throw err
        }
      })())
    },
  }
}

async function waitOnAdvisoryLock(key: string, marker: string): Promise<void> {
  const client = await writePool.connect()
  try {
    await client.query(`/* ${marker} */ SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
      key,
    ])
  } finally {
    client.release()
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
