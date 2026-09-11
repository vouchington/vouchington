import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUserDirect } from '@voucha/test-helpers'
import { addUserRole } from '@services/users/roles-permissions'
import { createReferralProgramFixture } from '@voucha/test-helpers/entities/referral-programs'

describe('links', () => {
  let regularUser: Awaited<ReturnType<typeof createTestUserDirect>> | null = null
  let otherUser: Awaited<ReturnType<typeof createTestUserDirect>> | null = null
  let adminUser: Awaited<ReturnType<typeof createTestUserDirect>> | null = null
  let referralProgramId: string | null = null
  let testHostname: string | null = null

  beforeAll(async () => {
    regularUser = await createTestUserDirect()
    otherUser = await createTestUserDirect()
    adminUser = await createTestUserDirect()
    await addUserRole(adminUser!.id, 'administrator')

    const fixture = await createReferralProgramFixture({ createdById: regularUser!.id })
    referralProgramId = fixture.referralProgramId
    testHostname = fixture.hostname
  })
  describe('Referral Links Routes', () => {
    it('GET /api/v1/referral-links requires auth', async () => {
      const request = createRequest()
      await request.get('/api/v1/referral-links').expect(401)
    })

    it('POST /api/v1/referral-links validates content-type and required fields', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser!)

      await request.post('/api/v1/referral-links').send('not json').expect(415)

      await request
        .post('/api/v1/referral-links')
        .send({
          url: `https://${testHostname}/ref/${Date.now()}`,
        })
        .expect(422)

      await request
        .post('/api/v1/referral-links')
        .send({
          referral_program_id: referralProgramId,
        })
        .expect(422)
    })

    it('creates, lists, updates, deactivates, activates, and deletes a referral link', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser!)

      const created = await request
        .post('/api/v1/referral-links')
        .send({
          referral_program_id: referralProgramId,
          url: `https://${testHostname}/ref/create-${Date.now()}`,
          label: 'created by api',
        })
        .expect(201)
      expect(created.body.referral_link.label).toBe('created by api')

      const listed = await request.get('/api/v1/referral-links?limit=1').expect(200)
      expect(listed.body.results).toBeDefined()
      expect(listed.body.page_info).toBeDefined()
      expect(Array.isArray(listed.body.results)).toBe(true)
      expect(listed.body.results.length).toBeLessThanOrEqual(1)

      const updated = await request
        .patch(`/api/v1/referral-links/${created.body.referral_link.id}`)
        .send({ label: 'updated by api' })
        .expect(200)
      expect(updated.body.referral_link.label).toBe('updated by api')

      const deactivated = await request
        .delete(`/api/v1/referral-links/${created.body.referral_link.id}/activations`)
        .expect(200)
      expect(deactivated.body.referral_link.id).toBe(created.body.referral_link.id)
      expect(deactivated.body.referral_link.deactivated_at).toBeTruthy()

      const activated = await request
        .post(`/api/v1/referral-links/${created.body.referral_link.id}/activations`)
        .expect(200)
      expect(activated.body.referral_link.id).toBe(created.body.referral_link.id)
      expect(activated.body.referral_link.deactivated_at).toBeNull()

      await request.delete(`/api/v1/referral-links/${created.body.referral_link.id}`).expect(204)
    })

    it('GET /api/v1/referral-links enforces user scoping', async () => {
      const requestAsRegular = createRequest()
      await requestAsRegular.authenticateAs(regularUser!)

      await requestAsRegular.get(`/api/v1/referral-links?user_id=${otherUser!.id}`).expect(403)

      const requestAsAdmin = createRequest()
      await requestAsAdmin.authenticateAs(adminUser!)
      await requestAsAdmin
        .get(`/api/v1/referral-links?user_id=${regularUser!.id}&limit=2`)
        .expect(200)
    })

    it('PATCH/activate/deactivate return 404 for unknown link and enforce JSON content-type', async () => {
      const missingId = '00000000-0000-0000-0000-000000000000'
      const request = createRequest()
      await request.authenticateAs(regularUser!)

      await request.patch(`/api/v1/referral-links/${missingId}`).send('not json').expect(415)
      await request.patch(`/api/v1/referral-links/${missingId}`).send({ label: 'x' }).expect(404)

      await request.post(`/api/v1/referral-links/${missingId}/activations`).expect(404)
      await request.delete(`/api/v1/referral-links/${missingId}/activations`).expect(404)
    })
  })
})
