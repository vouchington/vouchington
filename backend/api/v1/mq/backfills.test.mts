import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { BACKFILL_REGISTRY } from './backfills-registry.mts'
import { postPublication } from '@queues/post-publication/queues'

describe('backfills', () => {
  let admin: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    regularUser = await createTestUser({ administrator: false })
  })

  describe('Backfills API Routes', () => {
    describe('GET /api/v1/mq/backfills', () => {
      it('should return 401 when not authenticated', async () => {
        const request = createRequest()
        await request.get('/api/v1/mq/backfills').expect(401)
      })

      it('should return 403 when user is not admin', async () => {
        const request = createRequest()
        await request.authenticateAs(regularUser)
        await request.get('/api/v1/mq/backfills').expect(403)
      })

      it('should return list of backfills when authenticated as admin', async () => {
        const request = createRequest()
        await request.authenticateAs(admin)
        const response = await request.get('/api/v1/mq/backfills').expect(200)

        expect(response.body).toHaveProperty('backfills')
        expect(Array.isArray(response.body.backfills)).toBe(true)
        expect(response.body.backfills.length).toBeGreaterThan(0)
      })

      it('should return backfills with required fields and no trigger', async () => {
        const request = createRequest()
        await request.authenticateAs(admin)
        const response = await request.get('/api/v1/mq/backfills').expect(200)

        const first = response.body.backfills[0]
        expect(first).toHaveProperty('id')
        expect(first).toHaveProperty('queue_name')
        expect(first).toHaveProperty('job_name')
        expect(first).toHaveProperty('description')
        expect(first).toHaveProperty('source_table')
        expect(first).not.toHaveProperty('trigger')
      })

      it('should return the same count as the registry', async () => {
        const request = createRequest()
        await request.authenticateAs(admin)
        const response = await request.get('/api/v1/mq/backfills').expect(200)

        expect(response.body.backfills.length).toBe(BACKFILL_REGISTRY.length)
      })
    })

    describe('POST /api/v1/mq/backfills/:id/runs', () => {
      it('should return 401 when not authenticated', async () => {
        const request = createRequest()
        await request.post('/api/v1/mq/backfills/openai-moderation-posts/runs').expect(401)
      })

      it('should return 403 when user is not admin', async () => {
        const request = createRequest()
        await request.authenticateAs(regularUser)
        await request.post('/api/v1/mq/backfills/openai-moderation-posts/runs').expect(403)
      })

      it('should return 404 for unknown backfill ID', async () => {
        const request = createRequest()
        await request.authenticateAs(admin)
        await request.post('/api/v1/mq/backfills/nonexistent-backfill/runs').expect(404)
      })

      it('should successfully trigger the posts backfill', async () => {
        const request = createRequest()
        await request.authenticateAs(admin)
        const response = await request
          .post('/api/v1/mq/backfills/openai-moderation-posts/runs')
          .expect(200)

        expect(response.body).toEqual({ success: true })
      })

      it('should successfully trigger the images backfill', async () => {
        const request = createRequest()
        await request.authenticateAs(admin)
        const response = await request
          .post('/api/v1/mq/backfills/openai-moderation-images/runs')
          .expect(200)

        expect(response.body).toEqual({ success: true })
      })

      it('should successfully trigger the report judgements backfill', async () => {
        const request = createRequest()
        await request.authenticateAs(admin)
        const response = await request
          .post('/api/v1/mq/backfills/backfill_report_judgements/runs')
          .expect(200)

        expect(response.body).toEqual({ success: true })
      })

      it('should successfully trigger the report integrity backfill', async () => {
        const request = createRequest()
        await request.authenticateAs(admin)
        const response = await request
          .post('/api/v1/mq/backfills/backfill_report_integrity/runs')
          .expect(200)

        expect(response.body).toEqual({ success: true })
      })

      it('should expose and trigger a read-only post-publication shadow audit', async () => {
        const request = createRequest()
        await request.authenticateAs(admin)
        const response = await request
          .post('/api/v1/mq/backfills/post-publication-shadow-dry-run/runs')
          .expect(200)

        expect(response.body).toEqual({ success: true })
        const jobs = (
          await Promise.all(
            (['waiting', 'active', 'delayed', 'completed', 'failed'] as const).map(state =>
              postPublication.getJobs(state),
            ),
          )
        ).flat()
        expect(jobs).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name: 'processShadowAuditPostPublication',
              data: { dryRun: true, cursor: null },
            }),
          ]),
        )
      })
    })
  })
})
