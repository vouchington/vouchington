import { beforeAll, describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestUrlHostname } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('GET /api/v1/hostname-block-operations/:operationId', () => {
  let administrator: PrivateUser

  beforeAll(async () => {
    administrator = (await createTestUser({ administrator: true })) as PrivateUser
  })

  it('returns the operation admitted by hostname blocking', async () => {
    const hostnameId = await insertTestUrlHostname({
      hostname: `operation-status-${crypto.randomUUID()}.example.com`,
    })
    const request = createRequest()
    await request.authenticateAs(administrator)
    const admission = await request
      .patch(`/api/v1/hostnames/${hostnameId}`)
      .send({ is_blocked: true })
      .expect(200)
    expect(admission.body).toEqual({
      operation_id: expect.any(String),
      status: 'pending',
      totals: null,
    })

    const status = await request
      .get(`/api/v1/hostname-block-operations/${admission.body.operation_id}`)
      .expect(200)

    expect(status.body).toEqual(admission.body)
  })

  it('returns 404 for a missing operation', async () => {
    const request = createRequest()
    await request.authenticateAs(administrator)
    await request.get(`/api/v1/hostname-block-operations/${uuidv7()}`).expect(404)
  })

  it('requires authentication', async () => {
    await createRequest().get(`/api/v1/hostname-block-operations/${uuidv7()}`).expect(401)
  })
})
