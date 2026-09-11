import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUserDirect } from '@voucha/test-helpers'
import { addUserRole } from '@services/users/roles-permissions'
import { createReferralProgramFixture } from '@voucha/test-helpers/entities/referral-programs'
import { upsertSystemUser } from '@services/users/system-users'

describe('official-links', () => {
  let regularUser: Awaited<ReturnType<typeof createTestUserDirect>> | null = null
  let adminUser: Awaited<ReturnType<typeof createTestUserDirect>> | null = null
  let referralProgramId: string | null = null
  let testHostname: string | null = null
  let createdLinkId: string | null = null

  beforeAll(async () => {
    await upsertSystemUser('voucha')

    regularUser = await createTestUserDirect()
    adminUser = await createTestUserDirect()
    await addUserRole(adminUser!.id, 'administrator')

    const fixture = await createReferralProgramFixture({ createdById: regularUser!.id })
    referralProgramId = fixture.referralProgramId
    testHostname = fixture.hostname
  }, 30_000)

  describe('Official Referral Links Routes', () => {
    it('GET /api/v1/referral-programs/:id/official-referral-links returns 403 for regular user', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser!)

      await request
        .get(`/api/v1/referral-programs/${referralProgramId}/official-referral-links`)
        .expect(403)
    })

    it('GET /api/v1/referral-programs/:id/official-referral-links returns 200 for admin', async () => {
      const request = createRequest()
      await request.authenticateAs(adminUser!)

      const res = await request
        .get(`/api/v1/referral-programs/${referralProgramId}/official-referral-links`)
        .expect(200)
      expect(Array.isArray(res.body.official_referral_links)).toBe(true)
    })

    it('POST /api/v1/referral-programs/:id/official-referral-links returns 403 for regular user', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser!)

      await request
        .post(`/api/v1/referral-programs/${referralProgramId}/official-referral-links`)
        .send({ url: `https://${testHostname}/ref/test-${Date.now()}` })
        .expect(403)
    })

    it('POST /api/v1/referral-programs/:id/official-referral-links returns 201 for admin', async () => {
      const request = createRequest()
      await request.authenticateAs(adminUser!)

      const res = await request
        .post(`/api/v1/referral-programs/${referralProgramId}/official-referral-links`)
        .send({ url: `https://${testHostname}/ref/official-${Date.now()}` })
        .expect(201)
      expect(res.body.official_referral_link.id).toBeTruthy()
      createdLinkId = res.body.official_referral_link.id
    })

    it('POST /api/v1/referral-programs/:id/official-referral-links returns 409 on duplicate URL', async () => {
      const request = createRequest()
      await request.authenticateAs(adminUser!)

      const duplicateUrl = `https://${testHostname}/ref/duplicate-${Date.now()}`
      await request
        .post(`/api/v1/referral-programs/${referralProgramId}/official-referral-links`)
        .send({ url: duplicateUrl })
        .expect(201)

      await request
        .post(`/api/v1/referral-programs/${referralProgramId}/official-referral-links`)
        .send({ url: duplicateUrl })
        .expect(409)
    })

    it('DELETE /api/v1/official-referral-links/:linkId returns 403 for regular user', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser!)

      await request.delete(`/api/v1/official-referral-links/${createdLinkId}`).expect(403)
    })

    it('DELETE /api/v1/official-referral-links/:linkId returns 204 for admin', async () => {
      const request = createRequest()
      await request.authenticateAs(adminUser!)

      await request.delete(`/api/v1/official-referral-links/${createdLinkId}`).expect(204)
    })

    it('DELETE /api/v1/official-referral-links/:linkId returns 404 for missing link', async () => {
      const request = createRequest()
      await request.authenticateAs(adminUser!)

      await request
        .delete('/api/v1/official-referral-links/00000000-0000-0000-0000-000000000000')
        .expect(404)
    })
  })
})
