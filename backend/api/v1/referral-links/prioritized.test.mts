import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createRandomString,
  createReferralProgramFixture,
  createTestUser,
} from '@voucha/test-helpers'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import { createUserReferralLink } from '@services/user-referral-program-links'

describe('prioritized referral links routes', () => {
  let referralProgramId: string
  let testHostname: string

  beforeAll(async () => {
    const admin = await createTestUser({ administrator: true })
    const suffix = createRandomString(8)
    const fixture = await createReferralProgramFixture({
      createdById: admin.id,
      randomSuffix: suffix,
      hostname: `prioritized-api-${suffix}.example.com`,
      pathname: '/ref/%',
    })
    referralProgramId = fixture.referralProgramId
    testHostname = fixture.hostname

    const linkOwner = await createTestUser()
    await createUserReferralLink(linkOwner, {
      user_id: linkOwner.id,
      referral_program_id: referralProgramId,
      url: `https://${testHostname}/ref/${createRandomString(8)}`,
      label: 'API cache test link',
    })
  }, 30_000)

  describe('GET /api/v1/topics/:id/prioritized-referral-links', () => {
    it('sets public Cache-Control for anonymous requests', async () => {
      const response = await createRequest()
        .get(`/api/v1/topics/${referralProgramId}/prioritized-referral-links`)
        .expect(200)

      expect(response.headers['cache-control']).toContain('public')
      expect(response.headers['cache-control']).toContain(
        `max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`,
      )
      expect(response.headers['vary']).toContain('Cookie')
      expect(response.headers['vary']).toContain('Authorization')
      expect(response.body.links.length).toBeGreaterThan(0)
    })

    it('does not set public Cache-Control for authenticated requests', async () => {
      const viewer = await createTestUser()
      const request = createRequest()
      await request.authenticateAs(viewer)

      const response = await request
        .get(`/api/v1/topics/${referralProgramId}/prioritized-referral-links`)
        .expect(200)

      expect(response.headers['cache-control'] ?? '').not.toContain('public')
    })

    it('rejects anonymous all-link requests without public Cache-Control', async () => {
      const response = await createRequest()
        .get(`/api/v1/topics/${referralProgramId}/prioritized-referral-links?all=true`)
        .expect(401)

      expect(response.body.message).toBe('Unauthorized')
      expect(response.headers['cache-control'] ?? '').not.toContain('public')
    })

    it('validates the all query flag before lookup', async () => {
      await createRequest()
        .get(`/api/v1/topics/${referralProgramId}/prioritized-referral-links?all=not-a-boolean`)
        .expect(422)
    })
  })
})
