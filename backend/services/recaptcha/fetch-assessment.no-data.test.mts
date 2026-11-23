import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as http from '@modules/utils/http'
import { fetchRecaptchaAssessment, getRecaptchaCredentials } from './fetch-assessment.mts'

const CREDS = {
  GOOGLE_RECAPTCHA_PROJECT_ID: 'proj-123',
  GOOGLE_RECAPTCHA_API_KEY: 'api-key-abc',
  GOOGLE_RECAPTCHA_SITE_KEY: 'site-key-xyz',
}

describe('recaptcha fetch-assessment', () => {
  beforeEach(() => {
    for (const [key, value] of Object.entries(CREDS)) vi.stubEnv(key, value)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  describe('getRecaptchaCredentials', () => {
    it('returns project, api key, and site key when all are set', () => {
      expect(getRecaptchaCredentials()).toEqual({
        projectId: 'proj-123',
        apiKey: 'api-key-abc',
        siteKey: 'site-key-xyz',
      })
    })

    it('is undefined when any credential is missing', () => {
      vi.stubEnv('GOOGLE_RECAPTCHA_API_KEY', undefined)
      expect(getRecaptchaCredentials()).toBeUndefined()
    })

    it('treats whitespace-only credentials as missing', () => {
      vi.stubEnv('GOOGLE_RECAPTCHA_SITE_KEY', '   ')
      expect(getRecaptchaCredentials()).toBeUndefined()
    })

    it('treats OpenTofu placeholder credentials as missing', () => {
      vi.stubEnv('GOOGLE_RECAPTCHA_PROJECT_ID', 'PLACEHOLDER')
      vi.stubEnv('GOOGLE_RECAPTCHA_API_KEY', 'PLACEHOLDER')
      expect(getRecaptchaCredentials()).toBeUndefined()
    })
  })

  describe('fetchRecaptchaAssessment', () => {
    it('sends the assessment through the external fetch', async () => {
      const fetch = vi.fn<VitestLooseMock>().mockResolvedValue(
        Response.json({
          tokenProperties: { valid: true, action: 'create_post' },
          riskAnalysis: { score: 0.7, reasons: [] },
        }),
      )
      vi.spyOn(http, 'getExternalFetch').mockReturnValue(fetch)
      const credentials = getRecaptchaCredentials()
      if (!credentials) throw new Error('expected credentials')

      await expect(
        fetchRecaptchaAssessment(credentials, 'tok', 'create_post', '203.0.113.7'),
      ).resolves.toMatchObject({ status: 'assessed', score: 0.7 })
      expect(fetch).toHaveBeenCalledOnce()
    })
  })
})
