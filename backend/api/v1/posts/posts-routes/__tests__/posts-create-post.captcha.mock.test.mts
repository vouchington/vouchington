import {
  overrideDynamicConfigFieldsForTest,
  deleteDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUserWithAge,
  createTestUrlWithHostname,
  CONTRIBUTING_USER_AGE_MS,
  createAppAttestAssertionHeaders,
  TEST_APP_ATTEST_BUNDLE_ID,
  TEST_APP_ATTEST_TEAM_ID,
  getContributionAdmissionConsumptionCountForTest,
} from '@voucha/test-helpers'
import { insertTestImage } from '@voucha/test-helpers/entities/images'
import { normalizeRouteAdmissionIntent } from '@services/contribution-gating/admit-route-contribution'
import { runContributionAdmission } from '@services/contribution-gating/admission'
import { CONTRIBUTION_ADMISSION_CLAIM_SECONDS } from '@services/contribution-gating/config'
import { appAttestationConfig } from '@services/app-attestation'
import { Response as UndiciResponse } from 'undici'
import type * as Undici from 'undici'

const mockFetch = vi.hoisted(() => vi.fn<typeof Undici.fetch>())

vi.mock<typeof import('undici')>(import('undici'), async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, fetch: mockFetch }
})

const TEST_CAPTCHA_TOKEN = 'mock-captcha-token'

describe('POST /api/v1/posts CAPTCHA', () => {
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
      .post('/api/v1/posts')
      .send({ post_type: 'discussion', title: 'No token', markdown: 'No token body' })
      .expect(422)

    expect(response.body.message).toContain('CAPTCHA token is required')
    await expect(
      getContributionAdmissionConsumptionCountForTest(user.id, 'discussion'),
    ).resolves.toBe(0)
  })

  it('rejects unknown post types without consuming discussion quota', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .post('/api/v1/posts')
      .send({
        post_type: 'unknown',
        title: 'Unknown type',
        markdown: 'Unknown type body',
        cf_turnstile_response: TEST_CAPTCHA_TOKEN,
      })
      .expect(422)

    expect(response.body.message).toContain('Unsupported post_type')
    await expect(
      getContributionAdmissionConsumptionCountForTest(user.id, 'discussion'),
    ).resolves.toBe(0)
  })

  it.each(['article', 'blog_post'] as const)(
    'rejects non-admin %s before CAPTCHA verification',
    async post_type => {
      const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      const request = createRequest()
      await request.authenticateAs(user)

      await request
        .post('/api/v1/posts')
        .send({ post_type, title: 'Restricted', markdown: 'Restricted body' })
        .expect(403)

      expect(mockFetch).not.toHaveBeenCalled()
    },
  )

  it('creates the post and forwards the token when verification passes', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .post('/api/v1/posts')
      .send({
        post_type: 'discussion',
        title: 'With token',
        markdown: 'With token body',
        cf_turnstile_response: TEST_CAPTCHA_TOKEN,
      })
      .expect(201)

    expect(response.body.post).toHaveProperty('id')
    expect(mockFetch).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      expect.objectContaining({
        body: expect.stringContaining(`response=${TEST_CAPTCHA_TOKEN}`),
      }),
    )
  })

  it('returns a retryable response while the same admission is in progress', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const request = createRequest()
    await request.authenticateAs(user)
    const key = crypto.randomUUID()
    const body = {
      post_type: 'discussion',
      title: 'In-progress admission',
      markdown: 'The durable claim exists before this route request.',
      cf_turnstile_response: TEST_CAPTCHA_TOKEN,
    }
    const claimed = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const pendingAdmission = runContributionAdmission({
      actorId: user.id,
      idempotencyKey: key,
      intent: normalizeRouteAdmissionIntent({ route: 'posts.create', body }),
      beforeCommit: async () => {
        claimed.resolve()
        await release.promise
      },
      execute: async () => ({ post: { id: crypto.randomUUID() } }),
    })
    await claimed.promise

    try {
      const response = await request
        .post('/api/v1/posts')
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

  it('skips Turnstile for bare link posts (url_id only, no title or markdown)', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const urlId = await createTestUrlWithHostname()
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .post('/api/v1/posts')
      .send({ post_type: 'link', url_id: urlId })
      .expect(201)

    expect(response.body.post).toHaveProperty('id')
    expect(response.body.post.post_type).toBe('link')
    expect(mockFetch).not.toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      expect.anything(),
    )
  })

  it('requires Turnstile for link posts that include user-authored title or markdown', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const urlId = await createTestUrlWithHostname()
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .post('/api/v1/posts')
      .send({ post_type: 'link', url_id: urlId, title: 'My commentary' })
      .expect(422)

    expect(response.body.message).toContain('CAPTCHA token is required')
  })

  it('requires Turnstile for raw-URL link posts (url field, no url_id)', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .post('/api/v1/posts')
      .send({ post_type: 'link', url: 'https://example.com/raw-url-no-token' })
      .expect(422)

    expect(response.body.message).toContain('CAPTCHA token is required')
  })

  it('requires Turnstile for link posts that include images', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const urlId = await createTestUrlWithHostname()
    const imageId = await insertTestImage(user.id)
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .post('/api/v1/posts')
      .send({
        post_type: 'link',
        url_id: urlId,
        images: [{ image_id: imageId, order_index: 0 }],
      })
      .expect(422)

    expect(response.body.message).toContain('CAPTCHA token is required')
  })

  describe('App Attest bypass', () => {
    beforeEach(() => {
      vi.stubEnv('APPLE_APP_ATTEST_TEAM_ID', TEST_APP_ATTEST_TEAM_ID)
      vi.stubEnv('APPLE_APP_ATTEST_BUNDLE_ID', TEST_APP_ATTEST_BUNDLE_ID)
      overrideDynamicConfigFieldsForTest(appAttestationConfig, { enabled: true })
      overrideDynamicConfigFieldsForTest(appAttestationConfig, {
        require_attestation_for_bypass: true,
      })
    })

    afterEach(() => {
      deleteDynamicConfigFieldsForTest(
        appAttestationConfig,
        Object.keys(appAttestationConfig.fieldTypes),
      )
    })

    it('creates the post via a valid App Attest assertion without any Turnstile token', async () => {
      const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      const request = createRequest()
      await request.authenticateAs(user)
      const headers = await createAppAttestAssertionHeaders({
        did: request.did,
        actionTag: 'posts.create',
      })

      const response = await request
        .post('/api/v1/posts')
        .set('x-app-attest-key-id', headers['x-app-attest-key-id'])
        .set('x-app-attest-assertion', headers['x-app-attest-assertion'])
        .set('x-app-attest-challenge-id', headers['x-app-attest-challenge-id'])
        .send({ post_type: 'discussion', title: 'App Attest post', markdown: 'App Attest body' })
        .expect(201)

      expect(response.body.post).toHaveProperty('id')
      expect(mockFetch).not.toHaveBeenCalledWith(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        expect.anything(),
      )
    })
  })
})
