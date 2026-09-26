import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUserDirect } from '@voucha/test-helpers'
import { addUserRole } from '@services/users/roles-permissions'
import { createReferralProgramFixture } from '@voucha/test-helpers/entities/referral-programs'
import { createChildReferralLink } from '@services/user-referral-program-links'
import { OFFICIAL_ACCOUNT_TRUST_SIGNAL_FORBIDDEN } from '@modules/on-error/error-codes'

describe('links', () => {
  const referralLinkKeys = [
    'activated_at',
    'consecutive_crawl_failures',
    'created_at',
    'deactivated_at',
    'deleted_at',
    'id',
    'label',
    'last_crawl_failure_at',
    'last_crawl_id',
    'last_crawl_success_at',
    'parent_link_id',
    'referral_program_id',
    'unfurl_completed_at',
    'unfurl_failed_at',
    'unfurl_last_error',
    'unfurl_requested_at',
    'updated_at',
    'url_id',
    'user_id',
  ]
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

    it('GET /api/v1/referral-links preserves pagination clamp and parser 400s before validation', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser!)

      await request.get('/api/v1/referral-links?limit=200').expect(200)
      await request.get('/api/v1/referral-links?limit=0').expect(400)
      await request.get('/api/v1/referral-links?limit=not-a-number').expect(400)
      await request.get('/api/v1/referral-links?limit=1&limit=2').expect(400)
    })

    it('rejects malformed UUID filters through the generated query contract', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser!)

      await request.get('/api/v1/referral-links?user_id=not-a-uuid').expect(422)
      await request.get('/api/v1/referral-links?referral_program_id=not-a-uuid').expect(422)
    })

    it('POST /api/v1/referral-links validates content-type and required fields', async () => {
      const unauthenticated = createRequest()
      await unauthenticated
        .post('/api/v1/referral-links')
        .set('Content-Type', 'application/json')
        .send('null')
        .expect(401)

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

      await request
        .post('/api/v1/referral-links')
        .set('Content-Type', 'application/json')
        .send('null')
        .expect(422)

      await request.post('/api/v1/referral-links').send({ user_id: otherUser!.id }).expect(403)
    })

    it('defaults nullable and empty user IDs while rejecting malformed IDs without a write', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser!)
      const before = await request.get('/api/v1/referral-links').expect(200)

      for (const user_id of [null, '']) {
        const created = await request
          .post('/api/v1/referral-links')
          .send({
            referral_program_id: referralProgramId,
            url: `https://${testHostname}/ref/default-user-${String(user_id)}-${Date.now()}`,
            user_id,
          })
          .expect(201)
        expect(created.body.referral_link.user_id).toBe(regularUser!.id)
      }

      await request
        .post('/api/v1/referral-links')
        .send({
          referral_program_id: referralProgramId,
          url: `https://${testHostname}/ref/invalid-user-${Date.now()}`,
          user_id: 42,
        })
        .expect(422)

      const after = await request.get('/api/v1/referral-links').expect(200)
      expect(after.body.results).toHaveLength(before.body.results.length + 2)
    })

    it('rejects official-account and child-link mutations before malformed body details', async () => {
      const officialRequest = createRequest()
      await officialRequest.authenticateAs(adminUser!)

      const officialCreate = await officialRequest
        .post('/api/v1/referral-links')
        .send({ url: 42 })
        .expect(403)
      expect(officialCreate.body.code).toBe(OFFICIAL_ACCOUNT_TRUST_SIGNAL_FORBIDDEN)

      const ownerRequest = createRequest()
      await ownerRequest.authenticateAs(regularUser!)
      const parent = await ownerRequest
        .post('/api/v1/referral-links')
        .send({
          referral_program_id: referralProgramId,
          url: `https://${testHostname}/ref/preflight-parent-${Date.now()}`,
        })
        .expect(201)

      const officialUpdate = await officialRequest
        .patch(`/api/v1/referral-links/${parent.body.referral_link.id}`)
        .send({ label: 42 })
        .expect(403)
      expect(officialUpdate.body.code).toBe(OFFICIAL_ACCOUNT_TRUST_SIGNAL_FORBIDDEN)

      const child = await createChildReferralLink(regularUser!.id, {
        userId: regularUser!.id,
        referralProgramId: referralProgramId!,
        url: `https://${testHostname}/ref/preflight-child-${Date.now()}`,
        parentLinkId: parent.body.referral_link.id,
      })
      await ownerRequest.patch(`/api/v1/referral-links/${child.id}`).send({ label: 42 }).expect(403)
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
      expect(Object.keys(created.body.referral_link).sort()).toEqual(referralLinkKeys)

      const listed = await request.get('/api/v1/referral-links?limit=1').expect(200)
      expect(listed.body.results).toBeDefined()
      expect(listed.body.page_info).toBeDefined()
      expect(Array.isArray(listed.body.results)).toBe(true)
      expect(listed.body.results.length).toBe(1)
      expect(Object.keys(listed.body.results[0]).sort()).toEqual(
        [...referralLinkKeys, 'referral_program_name', 'referral_program_slug', 'url'].sort(),
      )

      const updated = await request
        .patch(`/api/v1/referral-links/${created.body.referral_link.id}`)
        .send({ label: 'updated by api' })
        .expect(200)
      expect(updated.body.referral_link.label).toBe('updated by api')

      expect(Object.keys(updated.body.referral_link).sort()).toEqual(referralLinkKeys)

      const unchanged = await request
        .patch(`/api/v1/referral-links/${created.body.referral_link.id}`)
        .send({})
        .expect(200)
      expect(unchanged.body.referral_link.label).toBe('updated by api')
      expect(Object.keys(unchanged.body.referral_link).sort()).toEqual(referralLinkKeys)

      const cleared = await request
        .patch(`/api/v1/referral-links/${created.body.referral_link.id}`)
        .send({ label: null })
        .expect(200)
      expect(cleared.body.referral_link.label).toBeNull()

      const deactivated = await request
        .delete(`/api/v1/referral-links/${created.body.referral_link.id}/activations`)
        .expect(200)
      expect(deactivated.body.referral_link.id).toBe(created.body.referral_link.id)
      expect(deactivated.body.referral_link.deactivated_at).toBeTruthy()
      expect(Object.keys(deactivated.body.referral_link).sort()).toEqual(referralLinkKeys)

      const activated = await request
        .post(`/api/v1/referral-links/${created.body.referral_link.id}/activations`)
        .expect(200)
      expect(activated.body.referral_link.id).toBe(created.body.referral_link.id)
      expect(activated.body.referral_link.deactivated_at).toBeNull()
      expect(Object.keys(activated.body.referral_link).sort()).toEqual(referralLinkKeys)

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

      await request.post('/api/v1/referral-links/not-a-uuid/activations').expect(422)
    })
  })
})
