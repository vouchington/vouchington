import { derivePublicJwk, encodeJwkSet as encodeJwkSetForEnv } from '@vouchington/session-jwt'
import testPrivateKey from '@ts-shared/session-jwt/test-jwt-private-key'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { TEST_CAPTCHA_TOKEN } from '@voucha/test-helpers/captcha/test-captcha-token'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
  createTestTopic,
  createTestRssFeedWithTiming,
  createTestRssFeedItemWithUrl,
  insertTestStory,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import {
  overrideDynamicConfigFieldsForTest,
  snapshotDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'
import { contributionLimitConfig } from '@services/contribution-gating/limits-config'
import { recaptchaConfig } from '@services/recaptcha'
import { Response as UndiciResponse } from 'undici'
import type * as Undici from 'undici'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'

const mockFetch = vi.hoisted(() => vi.fn<typeof Undici.fetch>())

vi.mock<typeof import('undici')>(import('undici'), async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, fetch: mockFetch }
})

describe('POST /api/v1/posts reCAPTCHA capacity ordering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('SKIP_CAPTCHA_VERIFICATION', 'false')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it.each(['story', 'rss'] as const)(
    'never purchases a challenge assessment for a %s discussion even with a bad token',
    async source => {
      const restoreConfig = snapshotDynamicConfigFieldsForTest([recaptchaConfig])
      vi.stubEnv('ENVIRONMENT', 'staging')
      vi.stubEnv('VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64', encodeJwkSetForEnv([testPrivateKey]))
      vi.stubEnv(
        'VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64',
        encodeJwkSetForEnv([derivePublicJwk(testPrivateKey)]),
      )
      vi.stubEnv('GOOGLE_RECAPTCHA_PROJECT_ID', 'test-project')
      vi.stubEnv('GOOGLE_RECAPTCHA_API_KEY', 'test-api-key')
      vi.stubEnv('GOOGLE_RECAPTCHA_SITE_KEY', 'test-site-key')
      overrideDynamicConfigFieldsForTest(recaptchaConfig, { enabled: true, blocking_enabled: true })
      mockFetch.mockResolvedValue(
        new UndiciResponse(
          JSON.stringify({
            tokenProperties: { valid: true, action: 'create_post' },
            riskAnalysis: { score: 0, reasons: [] },
          }),
        ),
      )
      try {
        const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
        const topic = await createTestTopic({ user })
        const feed = await createTestRssFeedWithTiming(topic.id)
        const item = await createTestRssFeedItemWithUrl(feed)
        const story = await insertTestStory({ title: `Discussion ${crypto.randomUUID()}` })
        await setTestItemStoryId(item.id, story.id)
        const secondItem = await createTestRssFeedItemWithUrl(feed)
        await setTestItemStoryId(secondItem.id, story.id)
        const body =
          source === 'story'
            ? { post_type: 'story', story_id: story.id }
            : { post_type: 'link', rss_feed_item_id: item.id }
        const request = createRequest()
        await request.authenticateAs(user)
        await request
          .post('/api/v1/posts')
          .send({ ...body, recaptcha_token: 'bad-low-score-token' })
          .expect(201)
        expect(mockFetch).not.toHaveBeenCalled()
      } finally {
        restoreConfig()
      }
    },
  )

  it('rejects exhausted PostgreSQL capacity before purchasing another assessment', async () => {
    const restoreConfig = snapshotDynamicConfigFieldsForTest([
      contributionLimitConfig,
      recaptchaConfig,
    ])
    vi.stubEnv('ENVIRONMENT', 'staging')
    vi.stubEnv('VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64', encodeJwkSetForEnv([testPrivateKey]))
    vi.stubEnv(
      'VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64',
      encodeJwkSetForEnv([derivePublicJwk(testPrivateKey)]),
    )
    vi.stubEnv('CLOUDFLARE_TURNSTILE_SECRET_KEY', 'tests-turnstile-secret')
    vi.stubEnv('SITE_ORIGIN', 'https://turnstile.example.test')
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
      const body = stringFromUnknown(url).includes('recaptchaenterprise.googleapis.com')
        ? {
            tokenProperties: { valid: true, action: 'create_post' },
            riskAnalysis: { score: 0.9, reasons: [] },
          }
        : { success: true, hostname: 'turnstile.example.test', action: 'posts-create' }
      return new UndiciResponse(JSON.stringify(body))
    })

    try {
      const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      const request = createRequest()
      await request.authenticateAs(user)
      const post = (title: string) =>
        request.post('/api/v1/posts').send({
          post_type: 'discussion',
          title,
          markdown: `${title} body`,
          cf_turnstile_response: TEST_CAPTCHA_TOKEN,
          recaptcha_token: `recaptcha-${title}`,
        })

      await post('Within capacity').expect(201)
      await post('Over capacity').expect(429)

      const assessments = mockFetch.mock.calls.filter(([url]) =>
        stringFromUnknown(url).includes('recaptchaenterprise.googleapis.com'),
      )
      expect(assessments).toHaveLength(1)
    } finally {
      restoreConfig()
    }
  })
})
