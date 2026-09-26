import { describe, it, expect } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityApplication,
  createRandomString,
} from '@voucha/test-helpers'

// Covers the post-auth runtime request-contract validation added for issue #295. Split out of
// applications.test.mts, which is at the file's 300-line lint ceiling. See
// backend/api/v1/communities/reference-request-validation.md.
describe('Community Applications - request contract validation', () => {
  describe('POST /api/v1/communities/:slug/applications', () => {
    it('returns 422 for a non-object JSON body before running the answers/message checks', async () => {
      const [owner, applicant] = await Promise.all([createTestUser(), createTestUser()])
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `apps-rv-422-${random}`,
        visibility: 'private',
      })

      const request = createRequest()
      await request.authenticateAs(applicant!)
      await request
        .post(`/api/v1/communities/${community.slug}/applications`)
        .set('Content-Type', 'application/json')
        .send('null')
        .expect(422)
    })

    it('returns 401 (not 422) for a malformed body when unauthenticated', async () => {
      const owner = await createTestUser()
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner.id,
        slug: `apps-rv-401-${random}`,
        visibility: 'private',
      })

      const request = createRequest()
      const response = await request
        .post(`/api/v1/communities/${community.slug}/applications`)
        .set('Content-Type', 'application/json')
        .send('null')
        .expect(401)
      expect(response.text).not.toMatch(/invalid/i)
    })
  })

  describe('PATCH /api/v1/communities/:slug/applications/:id', () => {
    it('returns 422 for a non-object JSON body before resolving the application', async () => {
      const [owner, applicant] = await Promise.all([createTestUser(), createTestUser()])
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `apps-rv-patch-422-${random}`,
        visibility: 'private',
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: owner!.id,
        role: 'owner',
      })
      const application = await insertTestCommunityApplication({
        communityId: community.id,
        userId: applicant!.id,
      })

      const request = createRequest()
      await request.authenticateAs(owner!)
      await request
        .patch(`/api/v1/communities/${community.slug}/applications/${application.id}`)
        .set('Content-Type', 'application/json')
        .send('null')
        .expect(422)
    })

    it('returns 401 (not 422) for a malformed body when unauthenticated', async () => {
      const [owner, applicant] = await Promise.all([createTestUser(), createTestUser()])
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `apps-rv-patch-401-${random}`,
        visibility: 'private',
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: owner!.id,
        role: 'owner',
      })
      const application = await insertTestCommunityApplication({
        communityId: community.id,
        userId: applicant!.id,
      })

      const request = createRequest()
      const response = await request
        .patch(`/api/v1/communities/${community.slug}/applications/${application.id}`)
        .set('Content-Type', 'application/json')
        .send('null')
        .expect(401)
      expect(response.text).not.toMatch(/invalid/i)
    })
  })
})
