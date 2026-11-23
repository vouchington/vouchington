import { sentryCaptureExceptionMock } from '@voucha/test-helpers/vitest.setup.sentry-mock'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as http from '@modules/utils/http'
import { verifyCaptchaToken } from './verify.mts'
import { turnstileConfig } from './config.mts'
import {
  deleteDynamicConfigFieldsForTest,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'

// Cloudflare's always-pass test secret, the dev/test default.
const CLOUDFLARE_TURNSTILE_TEST_SECRET_KEY = '1x0000000000000000000000000000000AA'
const fetchSpy = vi.fn<VitestLooseMock>()

describe('verifyCaptchaToken', () => {
  let originalKey: string | undefined

  beforeEach(() => {
    vi.restoreAllMocks()
    fetchSpy.mockReset()
    vi.spyOn(http, 'getExternalFetch').mockReturnValue(fetchSpy)
    vi.unstubAllGlobals()
    originalKey = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY
    process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY = 'test-secret'
    vi.stubEnv('SITE_ORIGIN', 'https://voucha.ai')
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
      json: () => Promise.resolve({ success: true, hostname: 'voucha.ai', action: 'posts-create' }),
    })
    await expect(
      verifyCaptchaToken('valid-token', '1.2.3.4', 'posts.create'),
    ).resolves.toBeUndefined()
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it.each([
    { hostname: 'other.example.com', action: 'posts-create', code: 'turnstile_hostname_mismatch' },
    { hostname: 'voucha.ai', action: 'reports-create', code: 'turnstile_action_mismatch' },
    { hostname: 'voucha.ai', action: undefined, code: 'turnstile_action_mismatch' },
    { hostname: undefined, action: 'posts-create', code: 'turnstile_hostname_mismatch' },
  ])(
    'rejects success without the trusted action and hostname (%j)',
    async ({ code, ...metadata }) => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, ...metadata }),
      })
      const extra =
        code === 'turnstile_action_mismatch'
          ? { receivedAction: metadata.action ?? null }
          : { receivedHostname: metadata.hostname ?? null }
      await expect(
        verifyCaptchaToken('valid-token', '1.2.3.4', 'posts.create'),
      ).rejects.toMatchObject({
        status: 400,
        message: 'CAPTCHA verification failed',
        cause: { code, extra },
      })
      expect(sentryCaptureExceptionMock).toHaveBeenCalledTimes(1)
      expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(
        expect.objectContaining({ code }),
        expect.objectContaining({ extra }),
      )
    },
  )

  it('accepts the live dummy-key response only outside deployed environments', async () => {
    vi.stubEnv('CLOUDFLARE_TURNSTILE_SECRET_KEY', CLOUDFLARE_TURNSTILE_TEST_SECRET_KEY)
    vi.stubEnv('ENVIRONMENT', 'development')
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          hostname: 'example.com',
          metadata: { result_with_testing_key: true },
        }),
    })
    await expect(
      verifyCaptchaToken('dummy-token', undefined, 'posts.create'),
    ).resolves.toBeUndefined()
    vi.stubEnv('ENVIRONMENT', 'staging')
    await expect(
      verifyCaptchaToken('dummy-token', undefined, 'posts.create'),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('accepts the documented dummy-key context only outside deployed environments', async () => {
    vi.stubEnv('CLOUDFLARE_TURNSTILE_SECRET_KEY', CLOUDFLARE_TURNSTILE_TEST_SECRET_KEY)
    vi.stubEnv('ENVIRONMENT', 'development')
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, hostname: 'localhost', action: 'test' }),
    })
    await expect(
      verifyCaptchaToken('dummy-token', undefined, 'posts.create'),
    ).resolves.toBeUndefined()
    vi.stubEnv('ENVIRONMENT', 'staging')
    await expect(
      verifyCaptchaToken('dummy-token', undefined, 'posts.create'),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('rejects dummy-key responses with unexpected context', async () => {
    vi.stubEnv('CLOUDFLARE_TURNSTILE_SECRET_KEY', CLOUDFLARE_TURNSTILE_TEST_SECRET_KEY)
    vi.stubEnv('ENVIRONMENT', 'development')
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, hostname: 'other.example.com', action: 'test' }),
    })
    await expect(
      verifyCaptchaToken('dummy-token', undefined, 'posts.create'),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('throws 400 on verification failure', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: false, 'error-codes': ['invalid-input-response'] }),
    })
    await expect(verifyCaptchaToken('bad-token', '1.2.3.4', 'posts.create')).rejects.toMatchObject({
      status: 400,
      message: 'CAPTCHA verification failed',
    })
  })

  it('throws 502 with HTTP status cause when Turnstile returns non-2xx', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 500 }))
    await expect(verifyCaptchaToken('any-token', '1.2.3.4', 'posts.create')).rejects.toMatchObject({
      status: 502,
      message: 'CAPTCHA service unavailable',
      cause: expect.objectContaining({ message: 'Turnstile siteverify returned HTTP 500' }),
    })
  })

  it('throws 502 when Cloudflare rejects the secret rather than the token', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: false, 'error-codes': ['invalid-input-secret'] }),
    })
    await expect(verifyCaptchaToken('any-token', '1.2.3.4', 'posts.create')).rejects.toMatchObject({
      status: 502,
      message: 'CAPTCHA service unavailable',
    })
  })

  it('throws 502 with cause on network error', async () => {
    const networkError = new Error('Network error')
    fetchSpy.mockRejectedValue(networkError)
    await expect(verifyCaptchaToken('any-token', '1.2.3.4', 'posts.create')).rejects.toMatchObject({
      status: 502,
      message: 'CAPTCHA service unavailable',
      cause: expect.objectContaining({ cause: networkError }),
    })
  })

  it('throws 502 with cause on timeout', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError')
    fetchSpy.mockRejectedValue(abortError)
    await expect(verifyCaptchaToken('any-token', '1.2.3.4', 'posts.create')).rejects.toMatchObject({
      status: 502,
      message: 'CAPTCHA service unavailable',
      cause: expect.objectContaining({ cause: abortError }),
    })
  })

  it('throws 502 with cause when response.json() fails', async () => {
    const parseError = new SyntaxError('Unexpected token')
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.reject(parseError),
    })
    await expect(verifyCaptchaToken('any-token', '1.2.3.4', 'posts.create')).rejects.toMatchObject({
      status: 502,
      message: 'CAPTCHA service unavailable',
      cause: expect.objectContaining({ cause: parseError }),
    })
  })

  it('throws 422 when token is missing', async () => {
    await expect(verifyCaptchaToken(undefined, '1.2.3.4', 'posts.create')).rejects.toMatchObject({
      status: 422,
      message: 'CAPTCHA token is required',
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('skips verification without calling siteverify when SKIP_CAPTCHA_VERIFICATION is set', async () => {
    process.env.SKIP_CAPTCHA_VERIFICATION = 'true'
    await expect(
      verifyCaptchaToken('valid-token', '1.2.3.4', 'posts.create'),
    ).resolves.toBeUndefined()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('skips verification on staging when turnstile-config always_approve is true', async () => {
    vi.stubEnv('ENVIRONMENT', 'staging')
    overrideDynamicConfigFieldsForTest(turnstileConfig, { always_approve: true })
    await expect(verifyCaptchaToken(undefined, '1.2.3.4', 'posts.create')).resolves.toBeUndefined()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('still verifies on staging when always_approve is false', async () => {
    vi.stubEnv('ENVIRONMENT', 'staging')
    overrideDynamicConfigFieldsForTest(turnstileConfig, { always_approve: false })
    await expect(verifyCaptchaToken(undefined, '1.2.3.4', 'posts.create')).rejects.toMatchObject({
      status: 422,
      message: 'CAPTCHA token is required',
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('never honors always_approve on production', async () => {
    vi.stubEnv('ENVIRONMENT', 'production')
    overrideDynamicConfigFieldsForTest(turnstileConfig, { always_approve: true })
    await expect(verifyCaptchaToken(undefined, '1.2.3.4', 'posts.create')).rejects.toMatchObject({
      status: 422,
      message: 'CAPTCHA token is required',
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('falls back to the public Cloudflare test secret when no env key is set', async () => {
    delete process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, hostname: 'localhost', action: 'test' }),
    })
    await verifyCaptchaToken('valid-token', '1.2.3.4', 'posts.create')
    const body = fetchSpy.mock.calls[0]?.[1]?.body as string
    const params = new URLSearchParams(body)
    expect(params.get('secret')).toBe(CLOUDFLARE_TURNSTILE_TEST_SECRET_KEY)
  })

  it('falls back to the public test secret when env key is whitespace-only', async () => {
    process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY = '   '
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, hostname: 'localhost', action: 'test' }),
    })
    await verifyCaptchaToken('valid-token', '1.2.3.4', 'posts.create')
    const body = fetchSpy.mock.calls[0]?.[1]?.body as string
    const params = new URLSearchParams(body)
    expect(params.get('secret')).toBe(CLOUDFLARE_TURNSTILE_TEST_SECRET_KEY)
  })
})
