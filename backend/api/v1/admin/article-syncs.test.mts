import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { articleSync } from '@queues/article-sync/queues'
import type { PrivateUser } from '@services/users/types'

let admin: PrivateUser
let regularUser: PrivateUser

describe('article-syncs', () => {
  beforeAll(async () => {
    ;[admin, regularUser] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
  })

  describe('POST /api/v1/article-syncs', () => {
    beforeEach(async () => {
      await articleSync.obliterate({ force: true })
    })

    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.post('/api/v1/article-syncs').expect(401)
    })

    it('returns 403 for non-admin users', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.post('/api/v1/article-syncs').expect(403)
    })

    it('returns 202 with jobId on success', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      const res = await request.post('/api/v1/article-syncs').expect(202)
      expect(res.body).toEqual({ jobId: expect.any(String) })

      const job = await articleSync.getJob(res.body.jobId)
      expect(job?.name).toBe('processArticleSync')
      expect(job?.data).toEqual({ userId: admin.id })
    })
  })

  describe('GET /api/v1/article-syncs/:jobId', () => {
    beforeEach(async () => {
      await articleSync.obliterate({ force: true })
    })

    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.get('/api/v1/article-syncs/job-1').expect(401)
    })

    it('returns 404 when job not found', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.get('/api/v1/article-syncs/job-missing').expect(404)
    })

    it('returns active status when job is still running', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      const postRes = await request.post('/api/v1/article-syncs').expect(202)
      const res = await request.get(`/api/v1/article-syncs/${postRes.body.jobId}`).expect(200)
      expect(res.body).toEqual({ status: 'active' })
    })
  })
})
