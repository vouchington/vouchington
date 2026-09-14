import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { SCHEDULED_JOBS_REGISTRY } from './scheduled-jobs-registry.mts'

describe('scheduled-jobs', () => {
  let admin: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    regularUser = await createTestUser({ administrator: false })
  })

  describe('Scheduled Jobs API Routes', () => {
    describe('GET /api/v1/mq/scheduled-jobs', () => {
      it('should return 401 when not authenticated', async () => {
        const request = createRequest()
        await request.get('/api/v1/mq/scheduled-jobs').expect(401)
      })

      it('should return 403 when user is not admin', async () => {
        const request = createRequest()
        await request.authenticateAs(regularUser)
        await request.get('/api/v1/mq/scheduled-jobs').expect(403)
      })

      it('should return list of scheduled jobs when authenticated as admin', async () => {
        const request = createRequest()
        await request.authenticateAs(admin)
        const response = await request.get('/api/v1/mq/scheduled-jobs').expect(200)

        expect(response.body).toHaveProperty('jobs')
        expect(Array.isArray(response.body.jobs)).toBe(true)
        expect(response.body.jobs.length).toBeGreaterThan(0)
      })

      it('should return jobs with required fields', async () => {
        const request = createRequest()
        await request.authenticateAs(admin)
        const response = await request.get('/api/v1/mq/scheduled-jobs').expect(200)

        const firstJob = response.body.jobs[0]
        expect(firstJob).toHaveProperty('id')
        expect(firstJob).toHaveProperty('queue_name')
        expect(firstJob).toHaveProperty('job_name')
        expect(firstJob).toHaveProperty('schedule')
        expect(firstJob).toHaveProperty('description')
        expect(firstJob).not.toHaveProperty('trigger')
      })

      it('should return the same count as the registry', async () => {
        const request = createRequest()
        await request.authenticateAs(admin)
        const response = await request.get('/api/v1/mq/scheduled-jobs').expect(200)

        expect(response.body.jobs.length).toBe(SCHEDULED_JOBS_REGISTRY.length)
      })
    })

    describe('POST /api/v1/mq/scheduled-jobs/:id/runs', () => {
      it('should return 401 when not authenticated', async () => {
        const request = createRequest()
        await request.post('/api/v1/mq/scheduled-jobs/kagi-smallweb-sync/runs').expect(401)
      })

      it('should return 403 when user is not admin', async () => {
        const request = createRequest()
        await request.authenticateAs(regularUser)
        await request.post('/api/v1/mq/scheduled-jobs/kagi-smallweb-sync/runs').expect(403)
      })

      it('should return 404 for unknown scheduler ID', async () => {
        const request = createRequest()
        await request.authenticateAs(admin)
        await request.post('/api/v1/mq/scheduled-jobs/nonexistent-job/runs').expect(404)
      })

      it('should successfully trigger a valid scheduled job', async () => {
        const request = createRequest()
        await request.authenticateAs(admin)
        const response = await request
          .post('/api/v1/mq/scheduled-jobs/kagi-smallweb-sync/runs')
          .expect(200)

        expect(response.body).toEqual({ success: true })
      })
    })
  })
})
