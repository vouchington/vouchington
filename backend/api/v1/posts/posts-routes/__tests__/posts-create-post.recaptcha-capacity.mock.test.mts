import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { CONTRIBUTING_USER_AGE_MS, createTestUserWithAge } from '@voucha/test-helpers'
import {
  overrideDynamicConfigFieldsForTest,
  snapshotDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'
import { contributionLimitConfig } from '@services/contribution-gating/limits-config'
import { recaptchaConfig } from '@services/recaptcha'
import { Response as UndiciResponse } from 'undici'
import type * as Undici from 'undici'

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

  it('rejects exhausted PostgreSQL capacity before purchasing another assessment', async () => {
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
      const request = createRequest()
      await request.authenticateAs(user)
      const post = (title: string) =>
        request.post('/api/v1/posts').send({
          post_type: 'discussion',
          title,
          markdown: `${title} body`,
          cf_turnstile_response: 'mock-captcha-token',
          recaptcha_token: `recaptcha-${title}`,
        })

      await post('Within capacity').expect(201)
      await post('Over capacity').expect(429)

      const assessments = mockFetch.mock.calls.filter(([url]) =>
        String(url).includes('recaptchaenterprise.googleapis.com'),
      )
      expect(assessments).toHaveLength(1)
    } finally {
      restoreConfig()
    }
  })
})
