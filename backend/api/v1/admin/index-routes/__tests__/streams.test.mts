import { ClientRequest } from 'node:http'
import { GlideClient, GlideClientConfiguration } from '@valkey/valkey-glide'
import { TestGlideClientScope } from '@voucha/test-helpers/glide-client-scope'
import { afterAll, beforeAll, describe, expect, it, vi, type MockInstance } from 'vitest'
import { closeApiTestServer, createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

type StreamCapture = {
  body: string
  contentType: string
}

let admin: PrivateUser
let regularUser: PrivateUser
const streamClients = new TestGlideClientScope()

describe('Admin SSE stream routes', () => {
  beforeAll(async () => {
    ;[admin, regularUser] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
    await Promise.all([import('../postgresql-stream-get.mts'), import('../valkey-stream-get.mts')])
  })

  afterAll(async () => {
    try {
      await closeApiTestServer()
    } finally {
      await streamClients.close()
    }
  })

  describe('GET /api/v1/admin/postgresql/stream', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.get('/api/v1/admin/postgresql/stream').expect(401)
    })

    it('returns 403 for non-admin users', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.get('/api/v1/admin/postgresql/stream').expect(403)
    })

    it('sets SSE headers and writes the initial migration-status snapshot for admin users', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)

      const capture = await captureAdminStream(request, '/api/v1/admin/postgresql/stream')

      expect(capture.contentType).toContain('text/event-stream')
      expect(capture.body).toContain('event: snapshot')
      expect(capture.body).toContain('"total"')
    })

    it('publishes a periodic snapshot and stops the ticker when the client disconnects', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)

      const capture = await captureAdminStream(request, '/api/v1/admin/postgresql/stream', {
        tickerIntervalMs: 30_000,
      })

      expect(capture.contentType).toContain('text/event-stream')
      expect(capture.body.match(/event: snapshot\n/g)).toHaveLength(2)
      expect(capture.body).toContain('"total"')
    })
  })

  describe('GET /api/v1/admin/valkey/stream', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.get('/api/v1/admin/valkey/stream').expect(401)
    })

    it('returns 403 for non-admin users', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.get('/api/v1/admin/valkey/stream').expect(403)
    })

    it('sets SSE headers and writes the initial cache-group snapshot for admin users', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)

      const capture = await captureAdminStream(request, '/api/v1/admin/valkey/stream')

      expect(capture.contentType).toContain('text/event-stream')
      expect(capture.body).toContain('event: snapshot')
      expect(capture.body).toContain('"groups"')
    })

    it('publishes periodic snapshots and stops the ticker when the client disconnects', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)

      const capture = await captureAdminStream(request, '/api/v1/admin/valkey/stream', {
        tickerIntervalMs: 10_000,
      })

      expect(capture.contentType).toContain('text/event-stream')
      expect(capture.body.match(/event: snapshot\n/g)).toHaveLength(2)
      expect(capture.body).toContain('"groups"')
      expect(streamClients.size).toBe(4)
    })
  })
})

async function captureAdminStream(
  request: ReturnType<typeof createRequest>,
  path: string,
  options?: { tickerIntervalMs: number },
): Promise<StreamCapture> {
  let contentType = ''
  const chunks: string[] = []
  const tickerStopped = Promise.withResolvers<void>()
  let clearIntervalSpy: MockInstance<typeof globalThis.clearInterval> | undefined
  let response: { destroy(): void } | undefined
  const responseClosed = Promise.withResolvers<void>()
  const req = request.get(path).set('Accept', 'text/event-stream').timeout(5000).buffer(false)
  const clientCreation = vi.spyOn(GlideClient, 'createClient').mockImplementation(async config => {
    const client = await streamClients.create(config)
    const patterns =
      config.pubsubSubscriptions?.channelsAndPatterns?.[
        GlideClientConfiguration.PubSubChannelModes.Pattern
      ]
    const ownedPatterns = ['admin:postgresql:*', 'admin:valkey:*'].filter(pattern =>
      patterns?.has(pattern),
    )
    if (ownedPatterns.length > 0) streamClients.own(client, ownedPatterns)
    return client
  })
  const publish = GlideClient.prototype.publish
  const publication = vi.spyOn(GlideClient.prototype, 'publish').mockImplementation(function (
    this: GlideClient,
    message,
    channel,
  ) {
    if (channel === 'admin:postgresql:snapshot' || channel === 'admin:valkey:snapshot') {
      streamClients.own(this)
    }
    return publish.call(this, message, channel)
  })

  if (options) {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const clearFakeInterval = globalThis.clearInterval
    clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval').mockImplementation(handle => {
      clearFakeInterval(handle)
      tickerStopped.resolve()
    })
  }

  try {
    await new Promise<void>((resolve, reject) => {
      let advanced = false
      const expectedSnapshotCount = options ? 2 : 1

      req.on(
        'response',
        (res: {
          headers: Record<string, string>
          on: (event: string, fn: (...args: unknown[]) => void) => void
          destroy: () => void
          once: (event: string, fn: () => void) => void
        }) => {
          response = res
          res.once('close', () => responseClosed.resolve())
          contentType = res.headers['content-type'] ?? ''
          res.on('data', (...args: unknown[]) => {
            chunks.push(String(args[0]))
            const snapshotCount = chunks.join('').match(/event: snapshot\n/g)?.length ?? 0
            if (snapshotCount >= expectedSnapshotCount) {
              res.destroy()
              resolve()
              return
            }
            if (options && snapshotCount === 1 && !advanced) {
              advanced = true
              void vi.advanceTimersByTimeAsync(options.tickerIntervalMs).catch(reject)
            }
          })
          res.on('error', () => resolve())
        },
      )

      req.on('error', (err: Error) => {
        if (contentType || chunks.length > 0) resolve()
        else reject(err)
      })
      req.catch(() => {
        if (contentType || chunks.length > 0) resolve()
      })
    })

    if (options) await tickerStopped.promise

    return { body: chunks.join(''), contentType }
  } finally {
    try {
      const transport = req.req
      const transportClosed =
        transport instanceof ClientRequest && !transport.closed
          ? new Promise<void>(resolve => transport.once('close', () => resolve()))
          : Promise.resolve()
      req.abort()
      response?.destroy()
      if (response) await responseClosed.promise
      await transportClosed
    } finally {
      clientCreation.mockRestore()
      publication.mockRestore()
      clearIntervalSpy?.mockRestore()
      if (options) {
        // Drain retained restorers before restoring real timer globals.
        vi.restoreAllMocks()
        vi.useRealTimers()
      }
    }
  }
}
