import { describe, it, beforeAll, beforeEach, expect } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { articleSync } from '@queues/article-sync/queues'
import { articleSyncPubSub } from '@data-stores/valkey-pubsub'
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

  it('streams a terminal queue status and closes the response', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    const job = await articleSync.add('processArticleSync', { userId: admin.id })
    expect(job).toBeTruthy()
    if (!job) throw new Error('Article sync job was not enqueued')
    const terminal = { status: 'failed' as const, error: 'Source unavailable — retry later' }
    let received = false
    const response = request
      .get(`/api/v1/admin/article-syncs/${job.id}/stream`)
      .timeout(5000)
      .expect('Content-Type', /text\/event-stream/)
      .expect(200)
      .then(result => {
        received = true
        return result
      })
    await expect
      .poll(
        async () => {
          await articleSyncPubSub.publish(job.id, terminal)
          return received
        },
        { timeout: 5000 },
      )
      .toBe(true)
    expect((await response).text).toBe(`event: status\ndata: ${JSON.stringify(terminal)}\n\n`)
  })
})
