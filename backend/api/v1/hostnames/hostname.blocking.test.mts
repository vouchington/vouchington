import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestUrlHostname } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('hostname blocking API', () => {
  let administrator: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    ;[administrator, regularUser] = await Promise.all([
      createTestUser({ administrator: true }) as Promise<PrivateUser>,
      createTestUser({ administrator: false }) as Promise<PrivateUser>,
    ])
  })

  it('requires an administrator to start a block', async () => {
    const hostnameId = await insertTestUrlHostname({ hostname: randomHostname() })
    await createRequest()
      .patch(`/api/v1/hostnames/${hostnameId}`)
      .send({ is_blocked: true })
      .expect(401)

    const request = createRequest()
    await request.authenticateAs(regularUser)
    await request.patch(`/api/v1/hostnames/${hostnameId}`).send({ is_blocked: true }).expect(403)
  })

  it('returns 404 for a missing hostname', async () => {
    const request = createRequest()
    await request.authenticateAs(administrator)
    await request.patch(`/api/v1/hostnames/${uuidv7()}`).send({ is_blocked: true }).expect(404)
  })

  it('returns a pending operation', async () => {
    const hostnameId = await insertTestUrlHostname({ hostname: randomHostname() })
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
  })

  it('returns a precise conflict while an accepted cleanup is pending', async () => {
    const hostnameId = await insertTestUrlHostname({ hostname: randomHostname() })
    const request = createRequest()
    await request.authenticateAs(administrator)
    await request.patch(`/api/v1/hostnames/${hostnameId}`).send({ is_blocked: true }).expect(200)

    const conflict = await request
      .patch(`/api/v1/hostnames/${hostnameId}`)
      .send({ is_blocked: false })
      .expect(409)

    expect(conflict.body.message).toBe(
      'Hostname cleanup is still in progress. Try unblocking again after it completes.',
    )
  })
})

function randomHostname(): string {
  return `api-block-test-${randomBytes(6).toString('hex')}.example.com`
}
