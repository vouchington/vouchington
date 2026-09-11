import { describe, it, beforeAll, beforeEach } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser } from '@voucha/test-helpers'
import { articleSync } from '@queues/article-sync/queues'
import type { PrivateUser } from '@services/users/types'

let admin: PrivateUser
let regularUser: PrivateUser

describe('GET /api/v1/admin/article-syncs/:jobId/stream', () => {
  beforeAll(async () => {
    ;[admin, regularUser] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
    await import('./article-syncs.mts')
  })

  beforeEach(async () => {
    await articleSync.obliterate({ force: true })
  })

  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.get('/api/v1/admin/article-syncs/job-123/stream').expect(401)
  })

  it('returns 403 for non-admin users', async () => {
    const request = createRequest()
    await request.authenticateAs(regularUser)
    await request.get('/api/v1/admin/article-syncs/job-123/stream').expect(403)
  })

  it('returns 404 when the job does not exist', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    await request.get('/api/v1/admin/article-syncs/nonexistent-job/stream').expect(404)
  })
})
