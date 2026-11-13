import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createRandomString,
  createReferralProgramFixture,
  createTestUser,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
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
    await createUserReferralLink(linkOwner, WEB_PROVENANCE, {
      user_id: linkOwner.id,
      referral_program_id: referralProgramId,
      url: `https://${testHostname}/ref/${createRandomString(8)}`,
      label: 'API cache test link',
    })
  })

  describe('GET /api/v1/topics/:id/prioritized-referral-links', () => {
    it('sets public Cache-Control for anonymous requests', async () => {
      const response = await createRequest()
        .get(`/api/v1/topics/${referralProgramId}/prioritized-referral-links`)
        .expect(200)
      expect(response.headers['cache-control']).toBe('public')
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

    it('pages all links newest first for signed-in viewers', async () => {
      const viewer = await createTestUser()
      const request = createRequest()
      await request.authenticateAs(viewer)

      const first = await request
        .get(`/api/v1/topics/${referralProgramId}/prioritized-referral-links?all=true&limit=1`)
        .expect(200)

      expect(first.body.links).toHaveLength(1)
      expect(first.body.page_info).toMatchObject({ has_next_page: false })
    })

    it('pages the shared list with limit and after, and defaults to the dynamic limit', async () => {
      const admin = await createTestUser({ administrator: true })
      const suffix = createRandomString(8)
      const fixture = await createReferralProgramFixture({
        createdById: admin.id,
        randomSuffix: suffix,
        hostname: `prioritized-paging-${suffix}.example.com`,
        pathname: '/ref/%',
      })
      for (let i = 0; i < 7; i++) {
        const owner = await createTestUser()
        await createUserReferralLink(owner, WEB_PROVENANCE, {
          user_id: owner.id,
          referral_program_id: fixture.referralProgramId,
          url: `https://${fixture.hostname}/ref/${createRandomString(8)}`,
          label: `paging ${i}`,
        })
      }
      const path = `/api/v1/topics/${fixture.referralProgramId}/prioritized-referral-links`

      const defaults = await createRequest().get(path).expect(200)
      expect(defaults.body.links).toHaveLength(5)
      expect(defaults.body.page_info.has_next_page).toBe(true)

      const first = await createRequest().get(`${path}?limit=3`).expect(200)
      const second = await createRequest()
        .get(`${path}?limit=3&after=${encodeURIComponent(first.body.page_info.end_cursor)}`)
        .expect(200)
      const ids = [...first.body.links, ...second.body.links].map((l: { id: string }) => l.id)
      expect(new Set(ids).size).toBe(6)
      expect(first.body.links.map((l: { id: string }) => l.id)).toEqual(
        defaults.body.links.slice(0, 3).map((l: { id: string }) => l.id),
      )

      const clamped = await createRequest().get(`${path}?limit=500`).expect(200)
      expect(clamped.body.links).toHaveLength(7)
    })

    it('rejects a limit that is not a positive integer', async () => {
      const path = `/api/v1/topics/${referralProgramId}/prioritized-referral-links`
      await createRequest().get(`${path}?limit=0`).expect(400)
      await createRequest().get(`${path}?limit=abc`).expect(400)
      await createRequest().get(`${path}?after=not-a-cursor`).expect(400)
    })
  })
})
