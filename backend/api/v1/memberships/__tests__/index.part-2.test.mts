import { describe, it, expect, beforeAll } from 'vitest'

import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, suspendTestUser } from '@voucha/test-helpers'

import {
  createTestSku,
  createRetiredTestSku,
  createTestMembership,
  getTestMembershipRaw,
} from '@voucha/test-helpers/entities/memberships'

import type { PrivateUser } from '@services/users/types'

import { v7 } from 'uuid'

describe('index', () => {
  let admin: PrivateUser

  let regularUser: PrivateUser

  let otherUser: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    regularUser = await createTestUser()
    otherUser = await createTestUser()
  })

  describe('POST /api/v1/membership-grants', () => {
    it('returns 401 without authentication', async () => {
      const request = createRequest()
      await request.post('/api/v1/membership-grants').send({}).expect(401)
    })

    it('returns 403 for non-admin users', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.post('/api/v1/membership-grants').send({}).expect(403)
    })

    it('returns 403 for suspended administrators', async () => {
      const suspendedAdmin = await createTestUser({ administrator: true })
      await suspendTestUser(suspendedAdmin.id, 'membership grant test')
      const request = createRequest()
      await request.authenticateAs(suspendedAdmin)
      await request.post('/api/v1/membership-grants').send({}).expect(403)
    })

    it('returns 400 for missing fields', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.post('/api/v1/membership-grants').send({}).expect(400)
    })

    it('returns 400 for a JSON null body', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .post('/api/v1/membership-grants')
        .set('Content-Type', 'application/json')
        .send('null')
        .expect(400)
    })

    it('returns 400 for missing user_id', async () => {
      const sku = await createTestSku({ plan: 'plus' })
      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .post('/api/v1/membership-grants')
        .send({ plan: 'plus', sku_id: sku.id, duration_days: 30 })
        .expect(400)
    })

    it('returns 400 for missing sku_id', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .post('/api/v1/membership-grants')
        .send({ user_id: regularUser.id, plan: 'plus', duration_days: 30 })
        .expect(400)
    })

    it('returns 400 for invalid plan', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .post('/api/v1/membership-grants')
        .send({
          user_id: regularUser.id,
          plan: 'invalid',
          sku_id: 'some-id',
          duration_days: 30,
        })
        .expect(400)
    })

    it('returns 400 for missing duration_days', async () => {
      const sku = await createTestSku({ plan: 'plus' })
      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .post('/api/v1/membership-grants')
        .send({ user_id: regularUser.id, plan: 'plus', sku_id: sku.id })
        .expect(400)
    })

    it.each([0, 1.5, 3661])('returns 400 for invalid duration_days %s', async durationDays => {
      const sku = await createTestSku({ plan: 'plus' })
      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .post('/api/v1/membership-grants')
        .send({
          user_id: regularUser.id,
          plan: 'plus',
          sku_id: sku.id,
          duration_days: durationDays,
        })
        .expect(400)
    })

    it('returns 400 for nonexistent sku_id', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .post('/api/v1/membership-grants')
        .send({
          user_id: regularUser.id,
          plan: 'plus',
          sku_id: '00000000-0000-0000-0000-000000000000',
          duration_days: 30,
        })
        .expect(400)
    })

    it('returns 400 for nonexistent user_id', async () => {
      const sku = await createTestSku({ plan: 'plus' })
      const nonexistentUserId = v7()
      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .post('/api/v1/membership-grants')
        .send({
          user_id: nonexistentUserId,
          plan: 'plus',
          sku_id: sku.id,
          duration_days: 30,
        })
        .expect(400)
    })

    it('grants membership to user', async () => {
      const grantee = await createTestUser()
      const sku = await createTestSku({ plan: 'pro' })

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .post('/api/v1/membership-grants')
        .send({ user_id: grantee.id, plan: 'pro', sku_id: sku.id, duration_days: 45 })
        .expect(201)

      expect(response.body).toEqual({
        membership: { id: expect.any(String) },
        grant: { id: expect.any(String) },
        queued: false,
      })
    })

    it('returns the queued grant without replacing the active membership', async () => {
      const activeMembership = await createTestMembership({
        user_id: otherUser.id,
        plan: 'plus',
        stripe_customer_id: `cus_queued_grant_${Date.now()}`,
        stripe_subscription_id: `sub_queued_grant_${Date.now()}`,
      })
      const sku = await createTestSku({ plan: 'pro' })

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .post('/api/v1/membership-grants')
        .send({ user_id: otherUser.id, plan: 'pro', sku_id: sku.id, duration_days: 30 })
        .expect(201)

      expect(response.body).toEqual({
        membership: null,
        grant: { id: expect.any(String) },
        queued: true,
      })
      await expect(getTestMembershipRaw(activeMembership.id)).resolves.toMatchObject({
        id: activeMembership.id,
        plan: 'plus',
      })
    })

    it('returns 400 when SKU plan does not match', async () => {
      const sku = await createTestSku({ plan: 'plus' })

      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .post('/api/v1/membership-grants')
        .send({ user_id: regularUser.id, plan: 'pro', sku_id: sku.id, duration_days: 30 })
        .expect(400)
    })

    it('returns 400 for a retired SKU', async () => {
      const sku = await createRetiredTestSku({ plan: 'plus' })
      const request = createRequest()
      await request.authenticateAs(admin)

      await request
        .post('/api/v1/membership-grants')
        .send({ user_id: regularUser.id, plan: 'plus', sku_id: sku.id, duration_days: 30 })
        .expect(400)
    })
  })

  describe('GET /api/v1/memberships/history/:userId', () => {
    it('returns 401 without authentication', async () => {
      const request = createRequest()
      await request.get(`/api/v1/memberships/history/${regularUser.id}`).expect(401)
    })

    it('returns 403 for non-admin users', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.get(`/api/v1/memberships/history/${regularUser.id}`).expect(403)
    })

    it('returns empty history for user with no membership', async () => {
      const historyUser = await createTestUser()

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .get(`/api/v1/memberships/history/${historyUser.id}`)
        .expect(200)

      expect(response.body).toHaveProperty('changes')
      expect(response.body.changes).toHaveLength(0)
    })

    it('returns history with changes after granting membership', async () => {
      const historyUser = await createTestUser()
      const sku = await createTestSku({ plan: 'plus' })

      // Grant membership
      const grantRequest = createRequest()
      await grantRequest.authenticateAs(admin)
      await grantRequest
        .post('/api/v1/membership-grants')
        .send({ user_id: historyUser.id, plan: 'plus', sku_id: sku.id, duration_days: 30 })
        .expect(201)
      // Check history
      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .get(`/api/v1/memberships/history/${historyUser.id}`)
        .expect(200)

      expect(response.body.changes.length).toBeGreaterThanOrEqual(1)
      const adminGrant = response.body.changes.find(
        (c: { change_type: string }) => c.change_type === 'admin_grant',
      )
      expect(adminGrant).toBeDefined()
    })
  })
})
