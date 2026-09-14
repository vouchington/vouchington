import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('index', () => {
  let admin: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    regularUser = await createTestUser({ administrator: false })
  })

  describe('Queue Monitoring API Routes', () => {
    describe('POST /api/v1/mq/queues/:name/retry-failed', () => {
      it('should return 401 when not authenticated', async () => {
        const request = createRequest()
        await request.post('/api/v1/mq/queues/psql/retry-failed').expect(401)
      })

      it('should return 403 when user is not admin', async () => {
        const request = createRequest()
        await request.authenticateAs(regularUser)
        await request.post('/api/v1/mq/queues/psql/retry-failed').expect(403)
      })

      it('should return 404 for unknown queue', async () => {
        const request = createRequest()
        await request.authenticateAs(admin)
        await request.post('/api/v1/mq/queues/nonexistent-queue/retry-failed').expect(404)
      })

      it('should retry failed jobs for a valid queue', async () => {
        const request = createRequest()
        await request.authenticateAs(admin)
        const response = await request.post('/api/v1/mq/queues/psql/retry-failed').expect(200)

        expect(response.body).toHaveProperty('success', true)
        expect(response.body).toHaveProperty('retried')
        expect(typeof response.body.retried).toBe('number')
      })
    })

    describe('GET /api/v1/mq/stream', () => {
      it('should return 401 when not authenticated', async () => {
        const request = createRequest()
        await request.get('/api/v1/mq/stream').expect(401)
      })

      it('should return 403 when user is not admin', async () => {
        const request = createRequest()
        await request.authenticateAs(regularUser)
        await request.get('/api/v1/mq/stream').expect(403)
      })

      it('should return SSE headers when authenticated as admin', async () => {
        const request = createRequest()
        await request.authenticateAs(admin)

        // SSE streams stay open indefinitely; capture headers via the response event.
        // Must call .end() to dispatch the request — without it the event never fires.
        await new Promise<void>((resolve, reject) => {
          let settled = false
          const req = request.get('/api/v1/mq/stream') as any
          req
            .buffer(false)
            .on('response', (res: any) => {
              try {
                expect(res.status).toBe(200)
                expect(res.headers['content-type']).toMatch(/text\/event-stream/)
                expect(res.headers['cache-control']).toContain('no-cache')
                expect(res.headers['x-accel-buffering']).toBe('no')
                settled = true
                // Prevent the IncomingMessage response stream from emitting an uncaught
                // 'aborted' error when the socket is destroyed on abort.
                res.on('error', () => {})
                req.abort()
                resolve()
              } catch (err) {
                settled = true
                reject(err)
              }
            })
            .on('error', (err: any) => {
              // After abort, socket close fires a plain Error('aborted') with no .code.
              // Once headers are captured, ignore all cleanup errors.
              if (settled) return
              if (err.code === 'ECONNRESET' || err.code === 'ECONNABORTED') return
              reject(err)
            })
            .end() // dispatch the request
        })
      })
    })
  })
})
