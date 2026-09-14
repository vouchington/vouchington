import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
  getContributionAdmissionConsumptionCountForTest,
  getContributionAdmissionReservationStateForTest,
} from '@voucha/test-helpers'
import { normalizeRouteAdmissionIntent } from '@services/contribution-gating/admit-route-contribution'
import { runContributionAdmission } from '@services/contribution-gating/admission'
import { CONTRIBUTION_ADMISSION_CLAIM_SECONDS } from '@services/contribution-gating/config'
import { Response as UndiciResponse } from 'undici'
import type * as Undici from 'undici'

const mockFetch = vi.hoisted(() => vi.fn<typeof Undici.fetch>())

vi.mock<typeof import('undici')>(import('undici'), async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, fetch: mockFetch }
})

const TEST_CAPTCHA_TOKEN = 'mock-captcha-token'

function recommendationBody(random: string): Record<string, unknown> {
  return {
    title: 'Need this topic',
    markdown: 'People keep discussing this but there is no topic yet.',
    topic_title: `Captcha Topic Recommendation ${random}`,
    topic_slug: `captcha-topic-recommendation-${random}`,
    topic_markdown: 'A proposed topic summary.',
    topic_hostname: `captcha-topic-recommendation-${random}.example.com`,
    topic_hostnames: [`captcha-topic-recommendation-${random}.example.com`],
    topic_aliases: [`captcha-topic-rec-alias-${random}`],
  }
}

describe('POST /api/v1/topic-recommendations CAPTCHA', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('SKIP_CAPTCHA_VERIFICATION', 'false')
    mockFetch.mockResolvedValue(new UndiciResponse(JSON.stringify({ success: true })))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns 422 when the Turnstile token is missing', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .post('/api/v1/topic-recommendations')
      .send(recommendationBody(`${Date.now()}-notoken`))
      .expect(422)

    expect(response.body.message).toContain('CAPTCHA token is required')
    await expect(
      getContributionAdmissionConsumptionCountForTest(user.id, 'topic_recommendation'),
    ).resolves.toBe(0)
  })

  it('runs the contribution gate before parsing or CAPTCHA verification', async () => {
    const user = await createTestUserWithAge(60_000)
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .post('/api/v1/topic-recommendations')
      .set('Content-Type', 'application/json')
      .send('not-json')
      .expect(403)

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('creates the recommendation and forwards the token when verification passes', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .post('/api/v1/topic-recommendations')
      .send({
        ...recommendationBody(`${Date.now()}-token`),
        cf_turnstile_response: TEST_CAPTCHA_TOKEN,
      })
      .expect(201)

    expect(response.body.post.post_type).toBe('topic_recommendation')
    expect(mockFetch).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      expect.objectContaining({
        body: expect.stringContaining(`response=${TEST_CAPTCHA_TOKEN}`),
      }),
    )
  })

  it('validates malformed payloads before claiming admission', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const request = createRequest()
    await request.authenticateAs(user)
    const key = crypto.randomUUID()

    const response = await request
      .post('/api/v1/topic-recommendations')
      .set('Idempotency-Key', key)
      .send({
        ...recommendationBody(`invalid-${Date.now()}`),
        cf_turnstile_response: TEST_CAPTCHA_TOKEN,
        topic_hostnames: 'not-an-array',
      })
      .expect(422)

    expect(response.body.message).toBe('Topic hostnames must be an array')
    expect(mockFetch).not.toHaveBeenCalled()
    await expect(
      getContributionAdmissionReservationStateForTest({
        actorId: user.id,
        idempotencyKey: key,
      }),
    ).resolves.toBeNull()
  })

  it('returns a retryable response while the same admission is in progress', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const request = createRequest()
    await request.authenticateAs(user)
    const key = crypto.randomUUID()
    const body = {
      ...recommendationBody(`in-progress-${Date.now()}`),
      cf_turnstile_response: TEST_CAPTCHA_TOKEN,
    }
    const claimed = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const pendingAdmission = runContributionAdmission({
      actorId: user.id,
      idempotencyKey: key,
      intent: normalizeRouteAdmissionIntent({ route: 'topic-recommendations.create', body }),
      beforeCommit: async () => {
        claimed.resolve()
        await release.promise
      },
      execute: async () => ({ post: { id: crypto.randomUUID() } }),
    })
    await claimed.promise

    try {
      const response = await request
        .post('/api/v1/topic-recommendations')
        .set('Idempotency-Key', key)
        .send(body)
        .expect(409)
      expect(response.body.code).toBe('CONTRIBUTION_ADMISSION_IN_PROGRESS')
      const retryAfterSeconds = Number(response.headers['retry-after'])
      expect(retryAfterSeconds).toBeGreaterThan(0)
      expect(retryAfterSeconds).toBeLessThanOrEqual(CONTRIBUTION_ADMISSION_CLAIM_SECONDS)
    } finally {
      release.resolve()
      await pendingAdmission
    }
  })
})
