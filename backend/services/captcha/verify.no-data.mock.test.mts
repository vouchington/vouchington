import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  extractTurnstileTokenFromBody,
  verifyCaptchaToken,
  CLOUDFLARE_TURNSTILE_TEST_SECRET_KEY,
  CLOUDFLARE_TURNSTILE_TEST_SECRET_KEYS,
} from './verify.mts'
import { getExternalRequestDispatcher } from '@modules/utils/http-dispatchers'
import { turnstileConfig } from './config.mts'
import {
  deleteDynamicConfigFieldsForTest,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'

const fetchSpy = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock<typeof import('undici')>(import('undici'), async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici')
  return { ...actual, fetch: fetchSpy }
})

describe('verifyCaptchaToken', () => {
  let originalKey: string | undefined

  beforeEach(() => {
    vi.restoreAllMocks()
    fetchSpy.mockReset()
    vi.unstubAllGlobals()
    originalKey = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY
    process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY = 'test-secret'
    delete process.env.SKIP_CAPTCHA_VERIFICATION
  })

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY
    } else {
      process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY = originalKey
    }
    deleteDynamicConfigFieldsForTest(turnstileConfig, Object.keys(turnstileConfig.fieldTypes))
    vi.unstubAllEnvs()
  })

  it('returns void on success', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    })
    await expect(verifyCaptchaToken('valid-token', '1.2.3.4')).resolves.toBeUndefined()
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      expect.objectContaining({
        dispatcher: getExternalRequestDispatcher(),
      }),
    )
  })

  it('throws 400 on verification failure', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: false, 'error-codes': ['invalid-input-response'] }),
    })
    await expect(verifyCaptchaToken('bad-token', '1.2.3.4')).rejects.toMatchObject({
      status: 400,
      message: 'CAPTCHA verification failed',
    })
  })

  it('throws 502 with HTTP status cause when Turnstile returns non-2xx', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 500 })
    await expect(verifyCaptchaToken('any-token', '1.2.3.4')).rejects.toMatchObject({
      status: 502,
      message: 'CAPTCHA service unavailable',
      cause: expect.objectContaining({ message: 'Turnstile HTTP 500' }),
    })
  })

  it('throws 502 with cause on network error', async () => {
    const networkError = new Error('Network error')
    fetchSpy.mockRejectedValue(networkError)
    await expect(verifyCaptchaToken('any-token', '1.2.3.4')).rejects.toMatchObject({
      status: 502,
      message: 'CAPTCHA service unavailable',
      cause: networkError,
    })
  })

  it('throws 502 with cause on timeout', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError')
    fetchSpy.mockRejectedValue(abortError)
    await expect(verifyCaptchaToken('any-token', '1.2.3.4')).rejects.toMatchObject({
      status: 502,
      message: 'CAPTCHA service unavailable',
      cause: abortError,
    })
  })

  it('throws 502 with cause when response.json() fails', async () => {
    const parseError = new SyntaxError('Unexpected token')
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.reject(parseError),
    })
    await expect(verifyCaptchaToken('any-token', '1.2.3.4')).rejects.toMatchObject({
      status: 502,
      message: 'CAPTCHA service unavailable',
      cause: parseError,
    })
  })

  it('throws 422 when token is missing', async () => {
    await expect(verifyCaptchaToken(undefined, '1.2.3.4')).rejects.toMatchObject({
      status: 422,
      message: 'CAPTCHA token is required',
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('skips verification without calling siteverify when SKIP_CAPTCHA_VERIFICATION is set', async () => {
    process.env.SKIP_CAPTCHA_VERIFICATION = 'true'
    await expect(verifyCaptchaToken('valid-token', '1.2.3.4')).resolves.toBeUndefined()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('skips the missing-token check when SKIP_CAPTCHA_VERIFICATION is set', async () => {
    process.env.SKIP_CAPTCHA_VERIFICATION = 'true'
    await expect(verifyCaptchaToken(undefined, undefined)).resolves.toBeUndefined()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('skips verification on staging when turnstile-config always_approve is true', async () => {
    vi.stubEnv('ENVIRONMENT', 'staging')
    overrideDynamicConfigFieldsForTest(turnstileConfig, { always_approve: true })
    await expect(verifyCaptchaToken(undefined, '1.2.3.4')).resolves.toBeUndefined()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('still verifies on staging when always_approve is false', async () => {
    vi.stubEnv('ENVIRONMENT', 'staging')
    overrideDynamicConfigFieldsForTest(turnstileConfig, { always_approve: false })
    await expect(verifyCaptchaToken(undefined, '1.2.3.4')).rejects.toMatchObject({
      status: 422,
      message: 'CAPTCHA token is required',
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('never honors always_approve on production', async () => {
    vi.stubEnv('ENVIRONMENT', 'production')
    overrideDynamicConfigFieldsForTest(turnstileConfig, { always_approve: true })
    await expect(verifyCaptchaToken(undefined, '1.2.3.4')).rejects.toMatchObject({
      status: 422,
      message: 'CAPTCHA token is required',
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('falls back to the public Cloudflare test secret when no env key is set', async () => {
    delete process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    })
    await verifyCaptchaToken('valid-token', '1.2.3.4')
    const body = fetchSpy.mock.calls[0]?.[1]?.body as string
    const params = new URLSearchParams(body)
    expect(params.get('secret')).toBe(CLOUDFLARE_TURNSTILE_TEST_SECRET_KEY)
  })

  it('falls back to the public test secret when env key is whitespace-only', async () => {
    process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY = '   '
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    })
    await verifyCaptchaToken('valid-token', '1.2.3.4')
    const body = fetchSpy.mock.calls[0]?.[1]?.body as string
    const params = new URLSearchParams(body)
    expect(params.get('secret')).toBe(CLOUDFLARE_TURNSTILE_TEST_SECRET_KEY)
  })

  it('exposes every public Cloudflare test secret in CLOUDFLARE_TURNSTILE_TEST_SECRET_KEYS', () => {
    expect(CLOUDFLARE_TURNSTILE_TEST_SECRET_KEYS).toContain(CLOUDFLARE_TURNSTILE_TEST_SECRET_KEY)
    expect(CLOUDFLARE_TURNSTILE_TEST_SECRET_KEYS).toEqual(
      expect.arrayContaining([
        '1x0000000000000000000000000000000AA',
        '2x0000000000000000000000000000000AA',
        '3x0000000000000000000000000000000AA',
      ]),
    )
  })
})

describe('extractTurnstileTokenFromBody', () => {
  it('extracts and trims the canonical Turnstile token field', () => {
    expect(extractTurnstileTokenFromBody({ cf_turnstile_response: ' token ' })).toBe('token')
  })

  it('supports explicit alias fields in priority order', () => {
    expect(
      extractTurnstileTokenFromBody(
        { cf_turnstile_response: ' ', cfTurnstileResponse: 'camel-token' },
        ['cf_turnstile_response', 'cfTurnstileResponse'],
      ),
    ).toBe('camel-token')
  })

  it('treats null, non-string, empty, and whitespace-only values as absent', () => {
    const absentBodies = [
      undefined,
      null,
      {},
      { cf_turnstile_response: null },
      { cf_turnstile_response: 123 },
      { cf_turnstile_response: '' },
      { cf_turnstile_response: '   ' },
    ]

    for (const body of absentBodies) {
      expect(extractTurnstileTokenFromBody(body)).toBeUndefined()
    }
  })
})
