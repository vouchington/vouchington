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
  const originalSetInterval = globalThis.setInterval
  const originalClearInterval = globalThis.clearInterval
  let tickerHandle: ReturnType<typeof setInterval> | undefined
  let tickerCallback: (() => void) | undefined
  let tickerStopped: (() => void) | undefined
  const tickerStoppedPromise = new Promise<void>(resolve => {
    tickerStopped = resolve
  })
  const setIntervalSpy = options ? vi.spyOn(globalThis, 'setInterval') : undefined
  const clearIntervalSpy = options ? vi.spyOn(globalThis, 'clearInterval') : undefined

  if (options && setIntervalSpy && clearIntervalSpy) {
    setIntervalSpy.mockImplementation((...args) => {
      const handle = originalSetInterval(...args)
      if (args[1] === options.tickerIntervalMs) {
        tickerHandle = handle
        tickerCallback = () => args[0]()
      }
      return handle
    })
    clearIntervalSpy.mockImplementation(handle => {
      originalClearInterval(handle)
      if (handle === tickerHandle) tickerStopped?.()
    })
  }

  try {
    await new Promise<void>((resolve, reject) => {
      let tickerTriggered = false
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
            } else if (options && snapshotCount === 1 && !tickerTriggered) {
              if (!tickerCallback) {
                reject(new Error('The admin snapshot ticker was not registered'))
                res.destroy()
                return
              }
              tickerTriggered = true
              tickerCallback()
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

    if (options) {
      if (!tickerHandle) throw new Error('The admin snapshot ticker was not registered')
      await tickerStoppedPromise
    }

    return { body: chunks.join(''), contentType }
  } finally {
    setIntervalSpy?.mockRestore()
    clearIntervalSpy?.mockRestore()
  }
}
