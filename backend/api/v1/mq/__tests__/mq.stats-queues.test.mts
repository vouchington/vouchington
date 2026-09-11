import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
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
    describe('GET /api/v1/mq/stats', () => {
      it('should return 401 when not authenticated', async () => {
        const request = createRequest()
        await request.get('/api/v1/mq/stats').expect(401)
      })

      it('should return 403 when user is not admin', async () => {
        const request = createRequest()
        await request.authenticateAs(regularUser)
        await request.get('/api/v1/mq/stats').expect(403)
      })

      it('should return aggregated queue stats when authenticated as admin', async () => {
        const request = createRequest()
        await request.authenticateAs(admin)
        const response = await request.get('/api/v1/mq/stats').expect(200)

        expect(response.body).toHaveProperty('stats')
        expect(response.body.stats).toHaveProperty('totalWaiting')
        expect(response.body.stats).toHaveProperty('totalActive')
        expect(response.body.stats).toHaveProperty('totalCompleted')
        expect(response.body.stats).toHaveProperty('totalFailed')
        expect(response.body.stats).toHaveProperty('queueCount')
        expect(typeof response.body.stats.totalWaiting).toBe('number')
        expect(typeof response.body.stats.totalActive).toBe('number')
        expect(typeof response.body.stats.totalCompleted).toBe('number')
        expect(typeof response.body.stats.totalFailed).toBe('number')
        expect(typeof response.body.stats.queueCount).toBe('number')
      })
    })

    describe('GET /api/v1/mq/queues', () => {
      it('should return 401 when not authenticated', async () => {
        const request = createRequest()
        await request.get('/api/v1/mq/queues').expect(401)
      })

      it('should return 403 when user is not admin', async () => {
        const request = createRequest()
        await request.authenticateAs(regularUser)
        await request.get('/api/v1/mq/queues').expect(403)
      })

      it('should return queue list with statistics when authenticated as admin', async () => {
        const request = createRequest()
        await request.authenticateAs(admin)
        const response = await request.get('/api/v1/mq/queues').expect(200)

        expect(response.body).toHaveProperty('queues')
        expect(response.body).toHaveProperty('total')
        expect(Array.isArray(response.body.queues)).toBe(true)
        expect(typeof response.body.total).toBe('number')
        expect(response.body.queues.length).toBeGreaterThan(0)
        const firstQueue = response.body.queues[0]
        expect(firstQueue).toHaveProperty('name')
        expect(firstQueue).toHaveProperty('waiting')
        expect(firstQueue).toHaveProperty('active')
        expect(firstQueue).toHaveProperty('completed')
        expect(firstQueue).toHaveProperty('failed')
        expect(firstQueue).toHaveProperty('paused')
      })

      it('should return all queues sorted by name', async () => {
        const request = createRequest()
        await request.authenticateAs(admin)
        const response = await request.get('/api/v1/mq/queues').expect(200)

        const queues = response.body.queues
        const names = queues.map((q: { name: string }) => q.name)
        expect(names).toEqual(names.toSorted((a: string, b: string) => a.localeCompare(b)))
      })
    })

    describe('POST /api/v1/mq/queues/:name/pause', () => {
      it('should return 401 when not authenticated', async () => {
        const request = createRequest()
        await request.post('/api/v1/mq/queues/psql/pause').expect(401)
      })

      it('should return 403 when user is not admin', async () => {
        const request = createRequest()
        await request.authenticateAs(regularUser)
        await request.post('/api/v1/mq/queues/psql/pause').expect(403)
      })

      it('should return 404 for unknown queue', async () => {
        const request = createRequest()
        await request.authenticateAs(admin)
        await request.post('/api/v1/mq/queues/nonexistent-queue/pause').expect(404)
      })

      it('should pause a valid queue', async () => {
        const request = createRequest()
        await request.authenticateAs(admin)
        const response = await request.post('/api/v1/mq/queues/psql/pause').expect(200)

        expect(response.body).toEqual({ success: true })
      })
    })

    describe('POST /api/v1/mq/queues/:name/resume', () => {
      it('should return 401 when not authenticated', async () => {
        const request = createRequest()
        await request.post('/api/v1/mq/queues/psql/resume').expect(401)
      })

      it('should return 403 when user is not admin', async () => {
        const request = createRequest()
        await request.authenticateAs(regularUser)
        await request.post('/api/v1/mq/queues/psql/resume').expect(403)
      })

      it('should return 404 for unknown queue', async () => {
        const request = createRequest()
        await request.authenticateAs(admin)
        await request.post('/api/v1/mq/queues/nonexistent-queue/resume').expect(404)
      })

      it('should resume a valid queue', async () => {
        const request = createRequest()
        await request.authenticateAs(admin)
        const response = await request.post('/api/v1/mq/queues/psql/resume').expect(200)

        expect(response.body).toEqual({ success: true })
      })
    })
  })
})
