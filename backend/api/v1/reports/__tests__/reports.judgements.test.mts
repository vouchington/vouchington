import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestPost, insertTestModerationReport } from '@voucha/test-helpers'
import { addUserRole } from '@services/users/roles-permissions'
import type { PrivateUser } from '@services/users/types'
import crypto from 'node:crypto'

describe('POST /api/v1/reports/:id/judgements', () => {
  let regularUser: PrivateUser
  let adminUser: PrivateUser
  let moderatorUser: PrivateUser
  let postAuthor: PrivateUser
  let reporter: PrivateUser

  beforeAll(async () => {
    ;[regularUser, adminUser, postAuthor, reporter] = await Promise.all([
      createTestUser(),
      createTestUser({ administrator: true }),
      createTestUser(),
      createTestUser(),
    ])

    moderatorUser = await createTestUser()
    await addUserRole(moderatorUser.id, 'moderator')
    const { getPrivateUserByAny } = await import('@services/users/get')
    moderatorUser = (await getPrivateUserByAny(moderatorUser.id))!
  })

  it('returns 401 for unauthenticated requests', async () => {
    const request = createRequest()
    await request
      .post(`/api/v1/reports/${crypto.randomUUID()}/judgements`)
      .set('Content-Type', 'application/json')
      .send({})
      .expect(401)
  })

  it('returns 403 for a non-staff authenticated user', async () => {
    const request = createRequest()
    await request.authenticateAs(regularUser)
    await request
      .post(`/api/v1/reports/${crypto.randomUUID()}/judgements`)
      .set('Content-Type', 'application/json')
      .send({})
      .expect(403)
  })

  it('returns 422 for an invalid UUID param', async () => {
    const request = createRequest()
    await request.authenticateAs(adminUser)
    await request
      .post('/api/v1/reports/not-a-valid-uuid/judgements')
      .set('Content-Type', 'application/json')
      .send({})
      .expect(422)
  })

  it('returns 404 for a report that does not exist', async () => {
    const request = createRequest()
    await request.authenticateAs(adminUser)
    await request
      .post(`/api/v1/reports/${crypto.randomUUID()}/judgements`)
      .set('Content-Type', 'application/json')
      .send({})
      .expect(404)
  })

  it('returns 202 and queues a judgement for a valid report (admin)', async () => {
    const postId = await insertTestPost({
      createdById: postAuthor.id,
      slug: `judgement-route-admin-${crypto.randomUUID().slice(0, 8)}`,
      title: `Judgement Route Admin Post ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
      reason: 'spam',
    })

    const request = createRequest()
    await request.authenticateAs(adminUser)
    const response = await request
      .post(`/api/v1/reports/${reportId}/judgements`)
      .set('Content-Type', 'application/json')
      .send({})
      .expect(202)

    expect(response.body.queued).toBe(true)
    expect(response.body.rerun_by_id).toBe(adminUser.id)
  })

  it('returns 202 and queues a judgement for a valid report (site moderator)', async () => {
    const postId = await insertTestPost({
      createdById: postAuthor.id,
      slug: `judgement-route-mod-${crypto.randomUUID().slice(0, 8)}`,
      title: `Judgement Route Mod Post ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
      reason: 'harassment',
    })

    const request = createRequest()
    await request.authenticateAs(moderatorUser)
    const response = await request
      .post(`/api/v1/reports/${reportId}/judgements`)
      .set('Content-Type', 'application/json')
      .send({})
      .expect(202)

    expect(response.body.queued).toBe(true)
    expect(response.body.rerun_by_id).toBe(moderatorUser.id)
  })
})
