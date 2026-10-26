import type { Context } from '@jongleberry/api-server'
import { createTestUser } from '@voucha/test-helpers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BOT_CHALLENGE_REQUIRED } from '@modules/on-error/error-codes'
import { runWithSessionRequestContext } from '@modules/request-client-info'
import { markAuthenticatedOriginRequest } from '@modules/request-client-info/authenticated-origin'
import { markVerifiedSessionCredential } from '@modules/request-client-info/session-credential'
import { createVoteHandler } from './election-vote-handler.mts'

describe('election vote bot challenge admission', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('consumes the route rate limit before requiring a low-score bot proof', async () => {
    vi.stubEnv('SKIP_CAPTCHA_VERIFICATION', 'false')
    const user = await createTestUser()
    let routeRateLimitCalls = 0
    const handler = createVoteHandler({
      rateLimitPrefix: `vote-handler-bot-order-${crypto.randomUUID()}`,
      entityType: 'topic',
      routeKey: 'PUT:/api/v1/topics/:id/vote',
      upsertVotes: async () => [],
      getEntity: async () => ({ id: crypto.randomUUID() }),
      entityNotFoundMessage: 'Topic not found',
    })
    const req = {
      method: 'PUT',
      headers: { 'x-voucha-bot-score': '7' },
    } as unknown as Context['req']
    markAuthenticatedOriginRequest(req)
    markVerifiedSessionCredential(req)
    const sessionId = crypto.randomUUID()
    const deviceId = crypto.randomUUID()
    const ctx = {
      req,
      params: { id: crypto.randomUUID() },
      assert(condition: unknown): asserts condition {
        if (!condition) throw new Error('assertion failed')
      },
      getCurrentUser: async () => user,
      getSessionTokenData: async () => ({ did: deviceId, sid: sessionId, uid: user.id }),
      hasVerifiedRequestSignature: () => false,
      verifyAttestedRequestSignature: async () => {},
      applyRouteRateLimit: async () => {
        routeRateLimitCalls++
      },
    } as unknown as Context

    await expect(runWithSessionRequestContext(null, () => handler(ctx))).rejects.toMatchObject({
      code: BOT_CHALLENGE_REQUIRED,
    })
    expect(routeRateLimitCalls).toBe(1)
  })
})
