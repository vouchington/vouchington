import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock undici so the assessment never hits Google. Every test drives the mocked Response shape.
const mockFetch = vi.hoisted(() =>
  vi.fn<(url: string, options: { body: string }) => Promise<unknown>>(),
)
vi.mock<typeof import('undici')>(import('undici'), async orig => ({
  ...(await orig()),
  fetch: mockFetch as unknown as typeof import('undici').fetch,
}))

const { fetchRecaptchaAssessment, hasRecaptchaCredentials, RecaptchaRateLimitError } =
  await import('./fetch-assessment.mts')

type ResponseShape = {
  status?: number
  ok?: boolean
  json?: () => Promise<unknown>
}

function mockResponse({ status = 200, ok = true, json }: ResponseShape) {
  return {
    status,
    ok,
    json: json ?? (() => Promise.resolve({})),
    body: { cancel: () => Promise.resolve() },
  }
}

const CREDS = {
  GOOGLE_RECAPTCHA_PROJECT_ID: 'proj-123',
  GOOGLE_RECAPTCHA_API_KEY: 'api-key-abc',
  GOOGLE_RECAPTCHA_SITE_KEY: 'site-key-xyz',
}

let original: Record<string, string | undefined>

describe('recaptcha fetch-assessment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    original = {
      GOOGLE_RECAPTCHA_PROJECT_ID: process.env.GOOGLE_RECAPTCHA_PROJECT_ID,
      GOOGLE_RECAPTCHA_API_KEY: process.env.GOOGLE_RECAPTCHA_API_KEY,
      GOOGLE_RECAPTCHA_SITE_KEY: process.env.GOOGLE_RECAPTCHA_SITE_KEY,
    }
    Object.assign(process.env, CREDS)
  })

  afterEach(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  describe('hasRecaptchaCredentials', () => {
    it('is true when project, api key, and site key are all set', () => {
      expect(hasRecaptchaCredentials()).toBe(true)
    })

    it('is false when any credential is missing', () => {
      delete process.env.GOOGLE_RECAPTCHA_API_KEY
      expect(hasRecaptchaCredentials()).toBe(false)
    })

    it('treats whitespace-only credentials as missing', () => {
      process.env.GOOGLE_RECAPTCHA_SITE_KEY = '   '
      expect(hasRecaptchaCredentials()).toBe(false)
    })

    it('treats OpenTofu placeholder credentials as missing', () => {
      process.env.GOOGLE_RECAPTCHA_PROJECT_ID = 'PLACEHOLDER'
      process.env.GOOGLE_RECAPTCHA_API_KEY = 'PLACEHOLDER'
      expect(hasRecaptchaCredentials()).toBe(false)
    })
  })

  describe('fetchRecaptchaAssessment', () => {
    it('throws when credentials are not configured', async () => {
      delete process.env.GOOGLE_RECAPTCHA_PROJECT_ID
      await expect(fetchRecaptchaAssessment('tok', 'create_post', undefined)).rejects.toThrow(
        /credentials are not configured/,
      )
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('posts the token, site key, action, and ip to the project assessment endpoint', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({
          json: () =>
            Promise.resolve({
              tokenProperties: { valid: true, action: 'create_post' },
              riskAnalysis: { score: 0.8, reasons: ['LOW_CONFIDENCE_SCORE'] },
            }),
        }),
      )
      await fetchRecaptchaAssessment('tok', 'create_post', '203.0.113.7')
      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toContain('/projects/proj-123/assessments')
      expect(url).toContain('key=api-key-abc')
      const body = JSON.parse(options.body)
      expect(body.event).toMatchObject({
        token: 'tok',
        siteKey: 'site-key-xyz',
        expectedAction: 'create_post',
        userIpAddress: '203.0.113.7',
      })
    })

    it('omits userIpAddress when no ip is provided', async () => {
      mockFetch.mockResolvedValue(mockResponse({ json: () => Promise.resolve({}) }))
      await fetchRecaptchaAssessment('tok', 'create_post', undefined)
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.event).not.toHaveProperty('userIpAddress')
    })

    it('throws RecaptchaRateLimitError on HTTP 429', async () => {
      mockFetch.mockResolvedValue(mockResponse({ status: 429, ok: false }))
      await expect(
        fetchRecaptchaAssessment('tok', 'create_post', undefined),
      ).rejects.toBeInstanceOf(RecaptchaRateLimitError)
    })

    it('throws a generic error on other non-ok responses', async () => {
      mockFetch.mockResolvedValue(mockResponse({ status: 503, ok: false }))
      await expect(fetchRecaptchaAssessment('tok', 'create_post', undefined)).rejects.toThrow(
        /HTTP 503/,
      )
    })

    it('tolerates a non-ok response with no body to cancel', async () => {
      mockFetch.mockResolvedValue({ status: 500, ok: false, body: null })
      await expect(fetchRecaptchaAssessment('tok', 'create_post', undefined)).rejects.toThrow(
        /HTTP 500/,
      )
    })

    it('throws when the network request fails', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))
      await expect(fetchRecaptchaAssessment('tok', 'create_post', undefined)).rejects.toThrow(
        /request failed/,
      )
    })

    it('throws when the response is not valid JSON', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({ json: () => Promise.reject(new Error('bad json')) }),
      )
      await expect(fetchRecaptchaAssessment('tok', 'create_post', undefined)).rejects.toThrow(
        /invalid JSON/,
      )
    })

    it('parses a complete successful assessment', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({
          json: () =>
            Promise.resolve({
              tokenProperties: { valid: true, action: 'create_comment' },
              riskAnalysis: { score: 0.42, reasons: ['AUTOMATION', 5, 'LOW_CONFIDENCE_SCORE'] },
            }),
        }),
      )
      const result = await fetchRecaptchaAssessment('tok', 'create_comment', undefined)
      expect(result).toEqual({
        valid: true,
        action: 'create_comment',
        score: 0.42,
        reasons: ['AUTOMATION', 'LOW_CONFIDENCE_SCORE'],
      })
    })

    it('normalises an invalid/empty assessment payload', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({
          json: () =>
            Promise.resolve({
              tokenProperties: { valid: false, action: 42 },
              riskAnalysis: { score: 'high', reasons: 'nope' },
            }),
        }),
      )
      const result = await fetchRecaptchaAssessment('tok', 'create_post', undefined)
      expect(result).toEqual({ valid: false, action: null, score: null, reasons: [] })
    })

    it('defaults missing tokenProperties and riskAnalysis', async () => {
      mockFetch.mockResolvedValue(mockResponse({ json: () => Promise.resolve({}) }))
      const result = await fetchRecaptchaAssessment('tok', 'create_post', undefined)
      expect(result).toEqual({ valid: false, action: null, score: null, reasons: [] })
    })

    it('defaults when the response body is null', async () => {
      mockFetch.mockResolvedValue(mockResponse({ json: () => Promise.resolve(null) }))
      const result = await fetchRecaptchaAssessment('tok', 'create_post', undefined)
      expect(result).toEqual({ valid: false, action: null, score: null, reasons: [] })
    })
  })
})
