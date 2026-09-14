import { describe, it, expect } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  createRandomString,
} from '@voucha/test-helpers'

describe('Community Application Questions Routes', () => {
  describe('GET /api/v1/communities/:slug/application-questions', () => {
    it('returns questions array', async () => {
      const user = await createTestUser()
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: user.id,
        slug: `app-questions-get-${random}`,
      })

      const request = createRequest()
      const response = await request
        .get(`/api/v1/communities/${community.slug}/application-questions`)
        .expect(200)

      expect(Array.isArray(response.body.questions)).toBe(true)
    })
  })

  describe('PUT /api/v1/communities/:slug/application-questions', () => {
    it('returns 401 without auth', async () => {
      const user = await createTestUser()
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: user.id,
        slug: `app-questions-put-401-${random}`,
      })

      const request = createRequest()
      await request
        .put(`/api/v1/communities/${community.slug}/application-questions`)
        .set('Content-Type', 'application/json')
        .send({ questions: [] })
        .expect(401)
    })

    it('returns 403 as non-owner', async () => {
      const [owner, regular] = await Promise.all([createTestUser(), createTestUser()])
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `app-questions-put-403-${random}`,
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: regular!.id,
        role: 'member',
      })

      const request = createRequest()
      await request.authenticateAs(regular!)

      await request
        .put(`/api/v1/communities/${community.slug}/application-questions`)
        .set('Content-Type', 'application/json')
        .send({ questions: [] })
        .expect(403)
    })

    it('sets questions and returns 200 as owner', async () => {
      const user = await createTestUser()
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: user.id,
        slug: `app-questions-put-ok-${random}`,
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: user.id,
        role: 'owner',
      })

      const request = createRequest()
      await request.authenticateAs(user)

      const questions = [
        {
          question: 'Why do you want to join?',
          field_type: 'long_text',
          required: true,
        },
      ]

      const response = await request
        .put(`/api/v1/communities/${community.slug}/application-questions`)
        .set('Content-Type', 'application/json')
        .send({ questions })
        .expect(200)

      expect(Array.isArray(response.body.questions)).toBe(true)
      expect(response.body.questions.length).toBe(1)
      expect(response.body.questions[0].question).toBe('Why do you want to join?')
    })
  })
})
