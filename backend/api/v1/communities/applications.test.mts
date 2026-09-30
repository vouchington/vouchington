import { describe, it, expect } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityApplication,
  createRandomString,
  archiveTestCommunity,
} from '@voucha/test-helpers'
import { registerCommunityListGetAuthTests } from '../../../test-helpers/community-list-get-auth-tests.mts'

describe('Community Applications Routes', () => {
  describe('GET /api/v1/communities/:slug/applications', () => {
    registerCommunityListGetAuthTests({
      resource: 'applications',
      unauthenticatedSlugPrefix: 'apps-get-401-',
      forbiddenSlugPrefix: 'apps-get-403-',
      okSlugPrefix: 'apps-get-ok-',
      okVisibility: 'private',
    })
  })

  describe('POST /api/v1/communities/:slug/applications', () => {
    it('returns 401 without auth', async () => {
      const user = await createTestUser()
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: user.id,
        slug: `apps-create-401-${random}`,
        visibility: 'private',
      })

      const request = createRequest()
      await request
        .post(`/api/v1/communities/${community.slug}/applications`)
        .set('Content-Type', 'application/json')
        .send({ answers: {} })
        .expect(401)
    })

    it('returns 422 when applying to public community', async () => {
      const [owner, applicant] = await Promise.all([createTestUser(), createTestUser()])
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `apps-create-422-${random}`,
        visibility: 'public',
      })

      const request = createRequest()
      await request.authenticateAs(applicant!)

      await request
        .post(`/api/v1/communities/${community.slug}/applications`)
        .set('Content-Type', 'application/json')
        .send({ answers: {} })
        .expect(422)
    })

    it('returns 409 when applying to archived community', async () => {
      const [owner, applicant] = await Promise.all([createTestUser(), createTestUser()])
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `apps-create-archived-${random}`,
        visibility: 'private',
      })
      await archiveTestCommunity({ communityId: community.id, archivedById: owner!.id })

      const request = createRequest()
      await request.authenticateAs(applicant!)

      await request
        .post(`/api/v1/communities/${community.slug}/applications`)
        .set('Content-Type', 'application/json')
        .send({ answers: {} })
        .expect(409)
    })

    it('returns 201 when applying to private community', async () => {
      const [owner, applicant] = await Promise.all([createTestUser(), createTestUser()])
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `apps-create-ok-${random}`,
        visibility: 'private',
      })

      const request = createRequest()
      await request.authenticateAs(applicant!)

      const response = await request
        .post(`/api/v1/communities/${community.slug}/applications`)
        .set('Content-Type', 'application/json')
        .send({ answers: {} })
        .expect(201)

      expect(response.body).toHaveProperty('community_application')
      expect(response.body.community_application.community_id).toBe(community.id)
    })

    it('creates application with message when message is provided', async () => {
      const [owner, applicant] = await Promise.all([createTestUser(), createTestUser()])
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `apps-create-msg-${random}`,
        visibility: 'private',
      })

      const request = createRequest()
      await request.authenticateAs(applicant!)

      const response = await request
        .post(`/api/v1/communities/${community.slug}/applications`)
        .set('Content-Type', 'application/json')
        .send({ answers: {}, message: 'hello' })
        .expect(201)

      expect(response.body).toHaveProperty('community_application')
      const { message: applicationMessage } = response.body.community_application
      expect(applicationMessage).toBe('hello')
    })

    it('returns 422 when message exceeds 5000 characters', async () => {
      const [owner, applicant] = await Promise.all([createTestUser(), createTestUser()])
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `apps-create-long-msg-${random}`,
        visibility: 'private',
      })

      const request = createRequest()
      await request.authenticateAs(applicant!)

      await request
        .post(`/api/v1/communities/${community.slug}/applications`)
        .set('Content-Type', 'application/json')
        .send({ answers: {}, message: 'a'.repeat(5001) })
        .expect(422)
    })
  })

  describe('PATCH /api/v1/communities/:slug/applications/:id', () => {
    it('approves application as mod and returns 204', async () => {
      const [owner, applicant] = await Promise.all([createTestUser(), createTestUser()])
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `apps-approve-ok-${random}`,
        visibility: 'private',
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: owner!.id,
        role: 'owner',
      })

      // Create application as applicant
      const applicantRequest = createRequest()
      await applicantRequest.authenticateAs(applicant!)
      const appResponse = await applicantRequest
        .post(`/api/v1/communities/${community.slug}/applications`)
        .set('Content-Type', 'application/json')
        .send({ answers: {} })
        .expect(201)

      const applicationId = appResponse.body.community_application.id

      // Approve as owner
      const ownerRequest = createRequest()
      await ownerRequest.authenticateAs(owner!)
      await ownerRequest
        .patch(`/api/v1/communities/${community.slug}/applications/${applicationId}`)
        .set('Content-Type', 'application/json')
        .send({ status: 'approved' })
        .expect(204)
    })

    it('returns 403 when rejecting as non-mod', async () => {
      const [owner, applicant, regular] = await Promise.all([
        createTestUser(),
        createTestUser(),
        createTestUser(),
      ])
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `apps-reject-403-${random}`,
        visibility: 'private',
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: regular!.id,
        role: 'member',
      })

      // Create application as applicant
      const applicantRequest = createRequest()
      await applicantRequest.authenticateAs(applicant!)
      const appResponse = await applicantRequest
        .post(`/api/v1/communities/${community.slug}/applications`)
        .set('Content-Type', 'application/json')
        .send({ answers: {} })
        .expect(201)

      const applicationId = appResponse.body.community_application.id

      // Try reject as regular member
      const regularRequest = createRequest()
      await regularRequest.authenticateAs(regular!)
      await regularRequest
        .patch(`/api/v1/communities/${community.slug}/applications/${applicationId}`)
        .set('Content-Type', 'application/json')
        .send({ status: 'rejected' })
        .expect(403)
    })

    it('returns 409 when reviewing application in archived community', async () => {
      for (const status of ['approved', 'rejected'] as const) {
        const [owner, applicant] = await Promise.all([createTestUser(), createTestUser()])
        const random = createRandomString(8)
        const community = await insertTestCommunity({
          createdById: owner!.id,
          slug: `apps-${status}-archived-${random}`,
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
        await archiveTestCommunity({ communityId: community.id, archivedById: owner!.id })

        const request = createRequest()
        await request.authenticateAs(owner!)

        await request
          .patch(`/api/v1/communities/${community.slug}/applications/${application.id}`)
          .set('Content-Type', 'application/json')
          .send({ status })
          .expect(409)
      }
    })
  })
})
