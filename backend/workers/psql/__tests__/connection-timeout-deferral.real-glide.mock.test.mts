import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { createServer, connect, type Server, type Socket } from 'node:net'
import { Queue, QueueEvents, Worker, type Job } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { deferPostgresConnectionTimeout } from '@modules/queue-errors'
import { createTestPostgresConnectionWaitPool } from '@voucha/test-helpers/postgres-connection-wait'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }
const CONNECTION_TIMEOUT_MS = 100
const DEFERRAL_MS = 30_000

async function runDeferredConnectionWait(
  pool: ReturnType<typeof createTestPostgresConnectionWaitPool>,
) {
  const name = `psql_connect_wait_${randomUUID()}`
  const queue = new Queue(name, connection)
  const events = new QueueEvents(name, { ...connection, lastEventId: '0', blockTimeout: 1_000 })
  const worker = new Worker(
    name,
    (job: Job) => deferPostgresConnectionTimeout(job, () => pool.queryProbe()),
    { ...connection, blockTimeout: 1_000 },
  )
  const failed: string[] = []
  events.on('failed', event => failed.push(event.jobId))

  try {
    await Promise.all([events.waitUntilReady(), worker.waitUntilReady()])
    const retrying = Promise.race([
      once(events, 'retrying'),
      once(events, 'failed').then(([event]) => {
        throw new Error(`Job failed instead of deferring: ${JSON.stringify(event)}`)
      }),
    ])
    const job = await queue.add('database-read', {}, { attempts: 3 })
    if (!job) throw new Error('Expected a queued database-read job')

    const [event] = await retrying
    const stored = await queue.getJob(job.id)
    return {
      jobId: job.id,
      event,
      state: await stored?.getState(),
      attemptsMade: stored?.attemptsMade,
      failed,
    }
  } finally {
    await worker.close(true)
    await events.close()
    await queue.obliterate({ force: true })
    await queue.close()
  }
}

async function startHeldHandshakeProxy(connectionString: string): Promise<{
  connectionString: string
  close(): Promise<void>
}> {
  const target = new URL(connectionString)
  const sockets = new Set<Socket>()
  const server: Server = createServer(client => {
    sockets.add(client)
    client.once('close', () => sockets.delete(client))
    // Establish the upstream TCP connection, then withhold the PostgreSQL startup
    // handshake so pg-pool itself reaches its new-client connection deadline.
    const upstream = connect(Number(target.port || 5432), target.hostname)
    sockets.add(upstream)
    upstream.once('close', () => sockets.delete(upstream))
    upstream.on('error', () => client.destroy())
    client.once('close', () => upstream.destroy())
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected a TCP proxy port')
  const proxyUrl = new URL(connectionString)
  proxyUrl.hostname = '127.0.0.1'
  proxyUrl.port = String(address.port)

  return {
    connectionString: proxyUrl.toString(),
    close: async () => {
      for (const socket of sockets) socket.destroy()
      await new Promise<void>((resolve, reject) =>
        server.close(error => (error ? reject(error) : resolve())),
      )
    },
  }
}

describe('PostgreSQL connection timeout deferral with real PostgreSQL and GlideMQ', () => {
  it('defers a new-client establishment timeout without consuming an attempt', async () => {
    const databaseUrl = process.env.DATABASE_URL
    if (!databaseUrl) throw new Error('DATABASE_URL is required')
    const proxy = await startHeldHandshakeProxy(databaseUrl)
    const pool = createTestPostgresConnectionWaitPool({
      connectionString: proxy.connectionString,
      connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    })
    try {
      const result = await runDeferredConnectionWait(pool)
      expect(result.event).toMatchObject({
        jobId: result.jobId,
        attemptsMade: '0',
        delay: String(DEFERRAL_MS),
      })
      expect(result).toMatchObject({ state: 'delayed', attemptsMade: 0, failed: [] })
    } finally {
      await pool.close()
      await proxy.close()
    }
  })

  it('defers an occupied-pool checkout timeout without consuming an attempt', async () => {
    const databaseUrl = process.env.DATABASE_URL
    if (!databaseUrl) throw new Error('DATABASE_URL is required')
    const pool = createTestPostgresConnectionWaitPool({
      connectionString: databaseUrl,
      max: 1,
      connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    })
    const releaseHeldClient = await pool.holdClient()
    try {
      const result = await runDeferredConnectionWait(pool)
      expect(result.event).toMatchObject({
        jobId: result.jobId,
        attemptsMade: '0',
        delay: String(DEFERRAL_MS),
      })
      expect(result).toMatchObject({ state: 'delayed', attemptsMade: 0, failed: [] })
    } finally {
      releaseHeldClient()
      await pool.close()
    }
  })
})
