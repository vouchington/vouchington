import { beforeAll, describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestSku,
  createTestUser,
  setTestMembershipGrantRemainingMilliseconds,
  updateTestMembershipExpiresAt,
} from '@voucha/test-helpers'
import {
  expireElapsedMembershipsBatch,
  getLatestMembershipByUserId,
  grantMembership,
} from '@services/memberships'
import type { PrivateUser } from '@services/users/types'

describe('DELETE /api/v1/membership-grants/:grantId', () => {
  let admin: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    regularUser = await createTestUser()
  })

  it('requires authentication and administrator access', async () => {
    await createRequest()
      .delete(`/api/v1/membership-grants/${v7()}`)
      .send({ reason: 'Incorrect grant' })
      .expect(401)

    const request = createRequest()
    await request.authenticateAs(regularUser)
    await request
      .delete(`/api/v1/membership-grants/${v7()}`)
      .send({ reason: 'Incorrect grant' })
      .expect(403)
  })

  it('validates the grant id and revocation reason', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    await request
      .delete('/api/v1/membership-grants/not-a-uuid')
      .send({ reason: 'Incorrect grant' })
      .expect(422)
    await request.delete(`/api/v1/membership-grants/${v7()}`).send({}).expect(400)
    await request
      .delete(`/api/v1/membership-grants/${v7()}`)
      .set('Content-Type', 'application/json')
      .send('null')
      .expect(400)
  })

  it('returns 404 for an unknown grant', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    await request
      .delete(`/api/v1/membership-grants/${v7()}`)
      .send({ reason: 'Incorrect grant' })
      .expect(404)
  })

  it('revokes an active grant idempotently', async () => {
    const member = await createTestUser()
    const sku = await createTestSku({ plan: 'plus' })
    const grant = await grantMembership(admin.id, member.id, 'plus', sku.id, 30)
    const request = createRequest()
    await request.authenticateAs(admin)

    await request
      .delete(`/api/v1/membership-grants/${grant.grantId}`)
      .send({ reason: 'Incorrect grant' })
      .expect(204)
    await request
      .delete(`/api/v1/membership-grants/${grant.grantId}`)
      .send({ reason: 'Ignored on replay' })
      .expect(204)

    await expect(getLatestMembershipByUserId(member.id)).resolves.toMatchObject({
      status: 'cancelled',
    })
  })

  it('rejects revoking a fully consumed grant', async () => {
    const member = await createTestUser()
    const activeSku = await createTestSku({ plan: 'plus' })
    const active = await grantMembership(admin.id, member.id, 'plus', activeSku.id, 30)
    const queuedSku = await createTestSku({ plan: 'pro', interval: 'yearly' })
    const completed = await grantMembership(admin.id, member.id, 'pro', queuedSku.id, 1)
    await setTestMembershipGrantRemainingMilliseconds(completed.grantId, 0.5)
    await updateTestMembershipExpiresAt(active.id, new Date(Date.now() - 24 * 60 * 60 * 1000))
    await expireElapsedMembershipsBatch()
    const request = createRequest()
    await request.authenticateAs(admin)

    await request
      .delete(`/api/v1/membership-grants/${completed.grantId}`)
      .send({ reason: 'Too late' })
      .expect(409)
  })
})
