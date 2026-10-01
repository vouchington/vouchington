import { describe, it, expect } from 'vitest'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import { setApplicationQuestions } from '@services/communities'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  createRandomString,
  archiveTestCommunity,
  insertTestCommunityBan,
  insertTestCommunityApplication,
  removeTestCommunityMember,
} from '@voucha/test-helpers'

describe('Community Application Questions Routes', () => {
  describe('GET /api/v1/communities/:slug/application-questions', () => {
    it.each(['public', 'private'] as const)(
      'enforces %s visibility and caching for anonymous, applicants, members and moderators',
      async visibility => {
        for (const role of [
          'anonymous',
          'applicant',
          'member',
          'moderator',
          'administrator',
        ] as const) {
          const owner = await createTestUser()
          const caller =
            role === 'anonymous'
              ? null
              : await createTestUser(role === 'administrator' ? { administrator: true } : {})
          const community = await insertTestCommunity({
            createdById: owner.id,
            visibility,
            slug: `questions-${createRandomString(12)}`,
          })
          await insertTestCommunityMember({
            communityId: community.id,
            userId: owner.id,
            role: 'owner',
          })
          if (caller && (role === 'member' || role === 'moderator')) {
            await insertTestCommunityMember({ communityId: community.id, userId: caller.id, role })
          }
          const questions = await setApplicationQuestions(owner.id, community.id, [
            { question: 'Applicant content', field_type: 'long_text', required: false },
          ])
          const request = createRequest()
          if (caller) await request.authenticateAs(caller)
          const allowed = visibility === 'public' || role !== 'anonymous'
          const response = await request
            .get(`/api/v1/communities/${community.slug}/application-questions`)
            .expect(allowed ? 200 : 404)
          expect(response.body.questions?.[0]?.id).toBe(allowed ? questions[0]!.id : undefined)
          if (visibility === 'private' && role === 'applicant') {
            await request
              .post(`/api/v1/communities/${community.slug}/applications`)
              .send({ answers: {} })
              .expect(201)
          }
          expect(response.headers['cache-control']).toBe(
            visibility === 'public' && role === 'anonymous'
              ? `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`
              : undefined,
          )
        }
      },
    )

    it.each(['eligible', 'archived', 'banned', 'removed'] as const)(
      'preserves question access for a pending applicant after %s eligibility state',
      async state => {
        const owner = await createTestUser()
        const caller = await createTestUser()
        const community = await insertTestCommunity({
          createdById: owner.id,
          visibility: 'private',
          slug: `questions-pending-${createRandomString(12)}`,
        })
        await insertTestCommunityMember({
          communityId: community.id,
          userId: owner.id,
          role: 'owner',
        })
        const questions = await setApplicationQuestions(owner.id, community.id, [
          { question: 'Application content', field_type: 'long_text', required: false },
        ])
        await insertTestCommunityApplication({ communityId: community.id, userId: caller.id })
        if (state === 'archived') {
          await archiveTestCommunity({ communityId: community.id, archivedById: owner.id })
        } else if (state === 'banned') {
          await insertTestCommunityBan({
            communityId: community.id,
            userId: caller.id,
            bannedById: owner.id,
          })
        } else if (state === 'removed') {
          await insertTestCommunityMember({
            communityId: community.id,
            userId: caller.id,
            role: 'member',
          })
          await removeTestCommunityMember(community.id, caller.id)
        }
        const request = createRequest()
        await request.authenticateAs(caller)
        const response = await request
          .get(`/api/v1/communities/${community.slug}/application-questions`)
          .expect(200)
        expect(response.body.questions[0].id).toBe(questions[0]!.id)
        expect(response.headers['cache-control']).toBeUndefined()
      },
    )

    it.each(['archived', 'banned', 'removed'] as const)(
      'conceals questions from an ineligible %s prospective applicant',
      async reason => {
        const owner = await createTestUser()
        const caller = await createTestUser()
        const community = await insertTestCommunity({
          createdById: owner.id,
          visibility: 'private',
          slug: `questions-denied-${createRandomString(12)}`,
        })
        await insertTestCommunityMember({
          communityId: community.id,
          userId: owner.id,
          role: 'owner',
        })
        await setApplicationQuestions(owner.id, community.id, [
          { question: 'Private content', field_type: 'long_text', required: false },
        ])
        if (reason === 'archived') {
          await archiveTestCommunity({ communityId: community.id, archivedById: owner.id })
        } else if (reason === 'banned') {
          await insertTestCommunityBan({
            communityId: community.id,
            userId: caller.id,
            bannedById: owner.id,
          })
        } else {
          await insertTestCommunityMember({
            communityId: community.id,
            userId: caller.id,
            role: 'member',
          })
          await removeTestCommunityMember(community.id, caller.id)
        }
        const request = createRequest()
        await request.authenticateAs(caller)
        const response = await request
          .get(`/api/v1/communities/${community.id}/application-questions`)
          .expect(404)
        expect(response.body).not.toHaveProperty('questions')
        expect(response.headers['cache-control']).toBeUndefined()
      },
    )
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
