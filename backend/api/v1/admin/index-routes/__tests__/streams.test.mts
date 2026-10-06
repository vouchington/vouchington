import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

type StreamCapture = {
  body: string
  contentType: string
}

let admin: PrivateUser
let regularUser: PrivateUser

describe('Admin SSE stream routes', () => {
  beforeAll(async () => {
    ;[admin, regularUser] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
    await Promise.all([import('../postgresql-stream-get.mts'), import('../valkey-stream-get.mts')])
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
  let clearIntervalSpy: ReturnType<typeof vi.spyOn> | undefined

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
      const req = request.get(path).set('Accept', 'text/event-stream').timeout(5000).buffer(false)

      req.on(
        'response',
        (res: {
          headers: Record<string, string>
          on: (event: string, fn: (...args: unknown[]) => void) => void
          destroy: () => void
        }) => {
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
    clearIntervalSpy?.mockRestore()
    if (options) vi.useRealTimers()
  }
}
