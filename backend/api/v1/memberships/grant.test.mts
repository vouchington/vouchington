import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestSku, createTestUser } from '@voucha/test-helpers'
import { withPostgresQueryFailureForTest } from '@voucha/test-helpers/postgres-query-failure'
import { getLatestMembershipByUserId } from '@services/memberships'

describe('POST /api/v1/membership-grants storage failure', () => {
  it('propagates a real transaction error and leaves the member ungranted', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const healthyMember = await createTestUser()
    const sku = await createTestSku({ plan: 'plus' })
    const request = createRequest()
    await request.authenticateAs(admin)
    const requestId = crypto.randomUUID()
    const body = { user_id: member.id, plan: 'plus', sku_id: sku.id, duration_days: 30 }
    await expect(getLatestMembershipByUserId(member.id)).resolves.toBeNull()

    const { result: response, error } = await withPostgresQueryFailureForTest(
      '/* createMembership: snapshot grant issuer */',
      async () => {
        await request
          .post('/api/v1/membership-grants')
          .set('x-request-id', crypto.randomUUID())
          .send({ ...body, user_id: healthyMember.id })
          .expect(201)
        return request
          .post('/api/v1/membership-grants')
          .set('x-request-id', requestId)
          .send(body)
          .expect(500)
      },
      { command: 'SELECT', requestId },
    )

    expect(error).toMatchObject({ code: '25P02' })
    expect(response.body).toMatchObject({
      code: '25P02',
      message: error.message,
      request_id: requestId,
    })
    await expect(getLatestMembershipByUserId(member.id)).resolves.toBeNull()
    const retry = await request
      .post('/api/v1/membership-grants')
      .set('x-request-id', requestId)
      .send(body)
      .expect(201)
    await expect(getLatestMembershipByUserId(member.id)).resolves.toMatchObject({
      id: retry.body.membership.id,
      status: 'active',
    })
  })
})
