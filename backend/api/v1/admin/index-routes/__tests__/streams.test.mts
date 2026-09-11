import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
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
  })
})

async function captureAdminStream(
  request: ReturnType<typeof createRequest>,
  path: string,
): Promise<StreamCapture> {
  let contentType = ''
  const chunks: string[] = []

  await new Promise<void>((resolve, reject) => {
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
          res.destroy()
          resolve()
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

  return { body: chunks.join(''), contentType }
}
