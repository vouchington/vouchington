import { describe, it, expect, beforeAll } from 'vitest'
import type { Context } from '@jongleberry/api-server'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  createTestUserDirect,
  createTestUserWithAge,
  insertTestTopic,
  resetContributionQuota,
  CONTRIBUTING_USER_AGE_MS,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import {
  EMAIL_VERIFICATION_REQUIRED,
  OFFICIAL_ACCOUNT_TRUST_SIGNAL_FORBIDDEN,
} from '@modules/on-error/error-codes'
import { createVoteHandler } from './election-vote-handler.mts'
import { getContributionQuota } from '@services/contribution-gating/quota'

describe('election-vote-handler', () => {
  let user: PrivateUser
  let adminUser: PrivateUser
  let topicId: string

  function randomSlug(prefix: string): string {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
  }

  beforeAll(async () => {
    user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    adminUser = await createTestUser({ administrator: true })
    topicId = await insertTestTopic({
      name: `Vote Handler Test ${randomSlug('topic')}`,
      slug: randomSlug('vote-handler-test'),
      createdById: adminUser.id,
    })
  }, 60_000)

  // Tests createVoteHandler via the topic route (simplest: no extra access check)
  describe('createVoteHandler (via PUT /api/v1/topics/:id/vote)', () => {
    it('returns 415 when Content-Type is not JSON', async () => {
      const request = createRequest()
      await request.authenticateAs(user)

      await request
        .put(`/api/v1/topics/${topicId}/vote`)
        .set('Content-Type', 'text/plain')
        .send('choice=like')
        .expect(415)
    }, 60_000)

    it('returns 422 for non-UUID id', async () => {
      const request = createRequest()
      await request.authenticateAs(user)

      await request.put('/api/v1/topics/not-a-uuid/vote').send({ choice: 'like' }).expect(422)
    }, 60_000)

    it('returns 401 when not authenticated', async () => {
      const request = createRequest()

      await request.put(`/api/v1/topics/${topicId}/vote`).send({ choice: 'like' }).expect(401)
    }, 60_000)

    it('returns 404 for non-existent entity', async () => {
      const request = createRequest()
      await request.authenticateAs(user)

      await request
        .put('/api/v1/topics/00000000-0000-0000-0000-000000000000/vote')
        .send({ choice: 'like' })
        .expect(404)
    }, 60_000)

    it('returns 422 when choice field is missing', async () => {
      const request = createRequest()
      await request.authenticateAs(user)

      await request.put(`/api/v1/topics/${topicId}/vote`).send({}).expect(422)
    }, 60_000)

    it('consumes the route rate limit before parsing the body', async () => {
      const parseError = new Error('malformed JSON')
      let routeRateLimitCalls = 0
      const handler = createVoteHandler({
        rateLimitPrefix: `vote-handler-order-${crypto.randomUUID()}`,
        entityType: 'topic',
        routeKey: 'PUT:/api/v1/topics/:id/vote',
        upsertVotes: async () => [],
        getEntity: async () => ({ id: topicId }),
        entityNotFoundMessage: 'Topic not found',
      })
      const ctx = {
        params: { id: topicId },
        assert: (condition: unknown) => {
          if (!condition) throw new Error('assertion failed')
        },
        getCurrentUser: async () => user,
        request: {
          json: async () => {
            throw parseError
          },
        },
        applyRouteRateLimit: async () => {
          routeRateLimitCalls++
        },
      } as unknown as Context

      await expect(handler(ctx)).rejects.toBe(parseError)
      expect(routeRateLimitCalls).toBe(1)
    })

    it('returns no content when the persistence layer has no accepted vote', async () => {
      const handler = createVoteHandler({
        rateLimitPrefix: `vote-handler-empty-result-${crypto.randomUUID()}`,
        entityType: 'topic',
        routeKey: 'PUT:/api/v1/topics/:id/vote',
        upsertVotes: async () => [],
        getEntity: async () => ({ id: topicId }),
        entityNotFoundMessage: 'Topic not found',
      })
      let status: number | undefined
      const ctx = {
        params: { id: topicId },
        ip: '127.0.0.1',
        req: { headers: {} },
        assert: (condition: unknown) => {
          if (!condition) throw new Error('assertion failed')
        },
        getCurrentUser: async () => user,
        getSessionTokenData: async () => ({}),
        request: { json: async () => ({ choice: 'like' }) },
        applyRouteRateLimit: async () => {},
        setStatus: (nextStatus: number) => {
          status = nextStatus
        },
      } as unknown as Context

      await handler(ctx)

      expect(status).toBe(204)
    })

    it('returns 422 when body is null', async () => {
      const request = createRequest()
      await request.authenticateAs(user)

      await request
        .put(`/api/v1/topics/${topicId}/vote`)
        .set('Content-Type', 'application/json')
        .send('null')
        .expect(422)
    }, 60_000)

    it('rejects numeric and cross-policy choices', async () => {
      const request = createRequest()
      await request.authenticateAs(user)

      await request.put(`/api/v1/topics/${topicId}/vote`).send({ score: 1 }).expect(422)
      await request.put(`/api/v1/topics/${topicId}/vote`).send({ choice: 'support' }).expect(422)
    }, 60_000)

    it('returns 204 on a successful semantic vote', async () => {
      const request = createRequest()
      await request.authenticateAs(user)

      await request.put(`/api/v1/topics/${topicId}/vote`).send({ choice: 'like' }).expect(204)
    }, 60_000)

    it('does not consume contribution quota for an immediate same-choice retry', async () => {
      const retryUser = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      const request = createRequest()
      await request.authenticateAs(retryUser)
      await resetContributionQuota(retryUser.id)

      await request.put(`/api/v1/topics/${topicId}/vote`).send({ choice: 'vouch' }).expect(204)
      const afterFirstVote = await getContributionQuota(retryUser.id, false, null)

      await request.put(`/api/v1/topics/${topicId}/vote`).send({ choice: 'vouch' }).expect(204)
      const afterRetry = await getContributionQuota(retryUser.id, false, null)

      expect(afterFirstVote.used).toBe(1)
      expect(afterRetry.used).toBe(afterFirstVote.used)
    }, 60_000)

    it('consumes one contribution quota unit for concurrent identical votes', async () => {
      const concurrentUser = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      const firstRequest = createRequest()
      const secondRequest = createRequest()
      await Promise.all([
        firstRequest.authenticateAs(concurrentUser),
        secondRequest.authenticateAs(concurrentUser),
      ])
      await resetContributionQuota(concurrentUser.id)

      await Promise.all([
        firstRequest.put(`/api/v1/topics/${topicId}/vote`).send({ choice: 'disavow' }).expect(204),
        secondRequest.put(`/api/v1/topics/${topicId}/vote`).send({ choice: 'disavow' }).expect(204),
      ])

      await expect(getContributionQuota(concurrentUser.id, false, null)).resolves.toMatchObject({
        used: 1,
      })
    }, 60_000)

    it('returns 403 with OFFICIAL_ACCOUNT_TRUST_SIGNAL_FORBIDDEN for official accounts', async () => {
      const request = createRequest()
      await request.authenticateAs(adminUser)

      const response = await request
        .put(`/api/v1/topics/${topicId}/vote`)
        .send({ choice: 'like' })
        .expect(403)
      expect(response.body.code).toBe(OFFICIAL_ACCOUNT_TRUST_SIGNAL_FORBIDDEN)
      expect(response.body.message).toBe('Official accounts cannot create community trust signals.')
    }, 60_000)

    it('returns 204 on dislike and then Neutral retract', async () => {
      const request = createRequest()
      await request.authenticateAs(user)

      await request.put(`/api/v1/topics/${topicId}/vote`).send({ choice: 'dislike' }).expect(204)
      await request.put(`/api/v1/topics/${topicId}/vote`).send({ choice: 'neutral' }).expect(204)
    }, 60_000)

    it('allows a fresh verified-email account to vote', async () => {
      const freshUser = await createTestUser()
      const request = createRequest()
      await request.authenticateAs(freshUser)

      await request.put(`/api/v1/topics/${topicId}/vote`).send({ choice: 'like' }).expect(204)
    }, 60_000)

    it('returns 403 with EMAIL_VERIFICATION_REQUIRED for account without verified email', async () => {
      const noEmailUser = await createTestUserDirect()
      const request = createRequest()
      await request.authenticateAs(noEmailUser)

      const response = await request
        .put(`/api/v1/topics/${topicId}/vote`)
        .send({ choice: 'like' })
        .expect(403)
      expect(response.body.code).toBe(EMAIL_VERIFICATION_REQUIRED)
      expect(response.body.message).toBe(
        'A verified non-disposable email address is required to vote.',
      )
    }, 60_000)

    it('returns 429 when rate limit is exceeded', async () => {
      // Use a dedicated user so rate limit keys are unique per test run
      const rateLimitUser = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      const request = createRequest()
      await request.authenticateAs(rateLimitUser)

      // The limit is 31 requests per 60s — send 30 to exhaust and the 31st triggers 429
      for (let i = 0; i < 30; i++) {
        await request.put(`/api/v1/topics/${topicId}/vote`).send({ choice: 'like' })
      }
      await request.put(`/api/v1/topics/${topicId}/vote`).send({ choice: 'like' }).expect(429)
    }, 60_000)
  })

  // Tests preAssertAccess enforcement via agent-moderation route (admin-only)
  describe('createVoteHandler preAssertAccess (via PUT /api/v1/agent-moderations/:id/vote)', () => {
    it('returns 401 when unauthenticated', async () => {
      const request = createRequest()

      await request
        .put('/api/v1/agent-moderations/00000000-0000-0000-0000-000000000000/vote')
        .send({ choice: 'like' })
        .expect(401)
    }, 60_000)

    it('returns 403 when non-admin (preAssertAccess runs before entity lookup)', async () => {
      const request = createRequest()
      await request.authenticateAs(user)

      await request
        .put('/api/v1/agent-moderations/00000000-0000-0000-0000-000000000000/vote')
        .send({ choice: 'like' })
        .expect(403)
    }, 60_000)
  })
})
