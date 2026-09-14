import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestReportAbusePenalty } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('GET /api/v1/report-integrity/penalties/:id', () => {
  const randomUsername = () => `test-ri-pen-get-${randomBytes(4).toString('hex')}`
  let admin: PrivateUser
  let member: PrivateUser
  let moderator: PrivateUser
  let support: PrivateUser

  beforeAll(async () => {
    ;[admin, member, moderator, support] = await Promise.all([
      createTestUser({ administrator: true, username: randomUsername() }),
      createTestUser({ administrator: false, username: randomUsername() }),
      createTestUser({ extraRoles: ['moderator'], username: randomUsername() }),
      createTestUser({ extraRoles: ['customer_support'], username: randomUsername() }),
    ])
  }, 60_000)

  it('requires administrator access', async () => {
    await createRequest().get(`/api/v1/report-integrity/penalties/${uuidv7()}`).expect(401)
    await Promise.all(
      [moderator, support, member].map(async user => {
        const request = createRequest()
        await request.authenticateAs(user)
        await request.get(`/api/v1/report-integrity/penalties/${uuidv7()}`).expect(403)
      }),
    )
  }, 60_000)

  it('returns 422 for an invalid ID and 404 for an unknown penalty', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    await request.get('/api/v1/report-integrity/penalties/invalid').expect(422)
    await request.get(`/api/v1/report-integrity/penalties/${uuidv7()}`).expect(404)
  }, 60_000)

  it('returns the exact authoritative penalty', async () => {
    const user = await createTestUser({ username: randomUsername() })
    const penaltyId = await insertTestReportAbusePenalty({ userId: user.id, createdById: admin.id })
    const request = createRequest()
    await request.authenticateAs(admin)
    const response = await request
      .get(`/api/v1/report-integrity/penalties/${penaltyId}`)
      .expect(200)
    expect(response.body.penalty).toMatchObject({
      id: penaltyId,
      user_id: user.id,
      created_by_id: admin.id,
      revoked_at: null,
    })
  }, 60_000)
})
