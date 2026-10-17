import { expectStaffOperationHistory } from '@voucha/test-helpers/staff-operation-history'
import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { ACCOUNT_LIFECYCLE_CLEANUP_EXPORTS_JOB } from '@queues/background/enqueues/account-lifecycle-jobs'
import { articleSync } from '@queues/article-sync/queues'
import { ARTICLE_SYNC_PROCESS_JOB } from '@queues/background/enqueues/article-sync-jobs'
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
      expect(job?.name).toBe(ARTICLE_SYNC_PROCESS_JOB.name)
      expect(job?.data).toEqual({ userId: admin.id })
      await expectStaffOperationHistory(admin.id, 'article_sync_run')
    })
  })

  describe('GET /api/v1/article-syncs/:jobId', () => {
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
      // The POST route's throttle admits one sync per window, so this job is added directly.
      const job = await articleSync.add(
        ARTICLE_SYNC_PROCESS_JOB.name,
        { userId: admin.id },
        ARTICLE_SYNC_PROCESS_JOB.options,
      )
      const res = await request.get(`/api/v1/article-syncs/${job!.id}`).expect(200)
      expect(res.body).toEqual({ status: 'active' })
    })

    it('returns 404 for a job that belongs to another domain of the shared queue', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      const other = await articleSync.add(
        ACCOUNT_LIFECYCLE_CLEANUP_EXPORTS_JOB.name,
        {},
        ACCOUNT_LIFECYCLE_CLEANUP_EXPORTS_JOB.options,
      )
      await request.get(`/api/v1/article-syncs/${other!.id}`).expect(404)
    })
  })
})
