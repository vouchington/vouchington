import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUserWithAge,
  CONTRIBUTING_USER_AGE_MS,
  insertTestCommunity,
  insertTestCommunityMember,
  getContributionAdmissionConsumptionCountForTest,
  overrideDynamicConfigFieldsForTest,
  snapshotDynamicConfigFieldsForTest,
} from '@voucha/test-helpers'
import { normalizeRouteAdmissionIntent } from '@services/contribution-gating/admit-route-contribution'
import { runContributionAdmission } from '@services/contribution-gating/admission'
import { CONTRIBUTION_ADMISSION_CLAIM_SECONDS } from '@services/contribution-gating/config'
import { contributionLimitConfig } from '@services/contribution-gating/limits-config'
import { recaptchaConfig } from '@services/recaptcha'
import { Response as UndiciResponse } from 'undici'
import type * as Undici from 'undici'

const mockFetch = vi.hoisted(() => vi.fn<typeof Undici.fetch>())

vi.mock<typeof import('undici')>(import('undici'), async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, fetch: mockFetch }
})

const TEST_CAPTCHA_TOKEN = 'mock-captcha-token'

describe('POST /api/v1/communities/:idOrSlug/posts CAPTCHA', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('SKIP_CAPTCHA_VERIFICATION', 'false')
    mockFetch.mockResolvedValue(new UndiciResponse(JSON.stringify({ success: true })))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns 403 IDENTITY_REQUIRED before CAPTCHA when the user has no identity', async () => {
    const owner = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const community = await insertTestCommunity({ createdById: owner.id })
    const noIdentityUser = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS, {
      noUsername: true,
    })
    const request = createRequest()
    await request.authenticateAs(noIdentityUser)

    const response = await request
      .post(`/api/v1/communities/${community.slug}/posts`)
      .send({ post_type: 'discussion', title: 'No identity', markdown: 'No identity body' })
      .expect(403)

    expect(response.body.code).toBe('IDENTITY_REQUIRED')
  })

  it('returns 422 when the Turnstile token is missing', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const community = await insertTestCommunity({ createdById: user.id })
    await insertTestCommunityMember({ communityId: community.id, userId: user.id, role: 'owner' })
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .post(`/api/v1/communities/${community.slug}/posts`)
      .send({ post_type: 'discussion', title: 'No token', markdown: 'No token body' })
      .expect(422)

    expect(response.body.message).toContain('CAPTCHA token is required')
    await expect(
      getContributionAdmissionConsumptionCountForTest(user.id, 'discussion'),
    ).resolves.toBe(0)
  })

  it('rejects unsupported root post types before consuming quota', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const community = await insertTestCommunity({ createdById: user.id })
    await insertTestCommunityMember({ communityId: community.id, userId: user.id, role: 'owner' })
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .post(`/api/v1/communities/${community.slug}/posts`)
      .send({
        post_type: 'story',
        title: 'Unsupported',
        markdown: 'Unsupported body',
        cf_turnstile_response: TEST_CAPTCHA_TOKEN,
      })
      .expect(422)

    expect(response.body.message).toContain('Unsupported community post_type')
    expect(mockFetch).not.toHaveBeenCalled()
    await expect(
      getContributionAdmissionConsumptionCountForTest(user.id, 'discussion'),
    ).resolves.toBe(0)
  })

  it('creates the community post and forwards the token when verification passes', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const community = await insertTestCommunity({ createdById: user.id })
    await insertTestCommunityMember({ communityId: community.id, userId: user.id, role: 'owner' })
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .post(`/api/v1/communities/${community.slug}/posts`)
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

  it('rejects exhausted capacity before purchasing another reCAPTCHA assessment', async () => {
    const restoreConfig = snapshotDynamicConfigFieldsForTest([
      contributionLimitConfig,
      recaptchaConfig,
    ])
    vi.stubEnv('ENVIRONMENT', 'staging')
    vi.stubEnv('GOOGLE_RECAPTCHA_PROJECT_ID', 'test-project')
    vi.stubEnv('GOOGLE_RECAPTCHA_API_KEY', 'test-api-key')
    vi.stubEnv('GOOGLE_RECAPTCHA_SITE_KEY', 'test-site-key')
    overrideDynamicConfigFieldsForTest(recaptchaConfig, { enabled: true })
    overrideDynamicConfigFieldsForTest(contributionLimitConfig, {
      authored_post_free_short_limit: 1,
      authored_post_free_daily_limit: 1,
      discussion_free_short_limit: 1,
      discussion_free_daily_limit: 1,
    })
    mockFetch.mockImplementation(async url => {
      const body = String(url).includes('recaptchaenterprise.googleapis.com')
        ? {
            tokenProperties: { valid: true, action: 'create_post' },
            riskAnalysis: { score: 0.9, reasons: [] },
          }
        : { success: true }
      return new UndiciResponse(JSON.stringify(body))
    })

    try {
      const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      const community = await insertTestCommunity({ createdById: user.id })
      await insertTestCommunityMember({ communityId: community.id, userId: user.id, role: 'owner' })
      const request = createRequest()
      await request.authenticateAs(user)
      const post = (title: string) =>
        request.post(`/api/v1/communities/${community.slug}/posts`).send({
          post_type: 'discussion',
          title,
          markdown: `${title} body`,
          cf_turnstile_response: TEST_CAPTCHA_TOKEN,
          recaptcha_token: `recaptcha-${title}`,
        })

      await post('Community within capacity').expect(201)
      await post('Community over capacity').expect(429)

      const assessments = mockFetch.mock.calls.filter(([url]) =>
        String(url).includes('recaptchaenterprise.googleapis.com'),
      )
      expect(assessments).toHaveLength(1)
    } finally {
      restoreConfig()
    }
  })

  it('returns a retryable response while the same admission is in progress', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const community = await insertTestCommunity({ createdById: user.id })
    await insertTestCommunityMember({ communityId: community.id, userId: user.id, role: 'owner' })
    const request = createRequest()
    await request.authenticateAs(user)
    const key = crypto.randomUUID()
    const body = {
      post_type: 'discussion',
      title: 'In-progress community admission',
      markdown: 'The durable claim exists before this route request.',
      cf_turnstile_response: TEST_CAPTCHA_TOKEN,
    }
    const claimed = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const pendingAdmission = runContributionAdmission({
      actorId: user.id,
      idempotencyKey: key,
      intent: normalizeRouteAdmissionIntent({
        route: 'communities.posts.create',
        community_id: community.id,
        body: { ...body, community_id: community.id },
      }),
      beforeCommit: async () => {
        claimed.resolve()
        await release.promise
      },
      execute: async () => ({ post: { id: crypto.randomUUID() } }),
    })
    await claimed.promise

    try {
      const response = await request
        .post(`/api/v1/communities/${community.slug}/posts`)
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
