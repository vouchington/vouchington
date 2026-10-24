import onError from '@modules/on-error'
import { toTurnstileAction } from '@ts-shared/utils/turnstile-action'
import { getSiteOrigin } from '@modules/utils/site-origin'
import { isDeployedEnvironment } from '@ts-shared/deploy-environment'
import createHttpError from 'http-errors'
import { fetch } from 'undici'
import { getExternalRequestDispatcher } from '@modules/utils/http-dispatchers'
import { isTurnstileAlwaysApprove, logTurnstileAlwaysApproveSkip } from './config.mts'

interface TurnstileResponse {
  success?: unknown
  hostname?: string
  action?: string
  metadata?: { result_with_testing_key?: boolean }
  'error-codes'?: string[]
}

class TurnstileContextMismatchError extends Error {
  readonly code: string
  readonly extra: Record<string, string | undefined>

  constructor(field: 'action' | 'hostname', received: string | undefined) {
    super(`Turnstile ${field} does not match`)
    this.code = `turnstile_${field}_mismatch`
    this.extra = field === 'action' ? { receivedAction: received } : { receivedHostname: received }
  }
}

// Cloudflare's well-known always-pass test secret. Used as the default in dev/test so the
// verification flow always exercises the real code path without requiring real keys. Backend
// startup (backend/entrypoints/api/serve.mts) asserts this value (and every other public Cloudflare
// test secret) is overridden in production.
// https://developers.cloudflare.com/turnstile/troubleshooting/testing/
export const CLOUDFLARE_TURNSTILE_TEST_SECRET_KEY = '1x0000000000000000000000000000000AA'

// All publicly documented Cloudflare Turnstile test secret keys. Backend startup rejects any of
// these in production because the corresponding Cloudflare responses (always-pass, always-fail,
// token-already-spent) do not match real-user behaviour and would silently break verification.
export const CLOUDFLARE_TURNSTILE_TEST_SECRET_KEYS: readonly string[] = [
  '1x0000000000000000000000000000000AA', // always passes
  '2x0000000000000000000000000000000AA', // always fails
  '3x0000000000000000000000000000000AA', // token already spent
]

function getSecretKey(): string {
  return process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY?.trim() || CLOUDFLARE_TURNSTILE_TEST_SECRET_KEY
}

/* no-mistakes: integration=http */
export async function fetchTurnstileVerify(
  token: string,
  ip: string | undefined,
): Promise<TurnstileResponse> {
  const params = new URLSearchParams({ secret: getSecretKey(), response: token })
  if (ip) params.set('remoteip', ip)
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    dispatcher: getExternalRequestDispatcher(),
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
    signal: AbortSignal.timeout(5000),
  }).catch(err => {
    throw createHttpError(502, 'CAPTCHA service unavailable', { cause: err })
  })
  if (!response.ok) {
    throw createHttpError(502, 'CAPTCHA service unavailable', {
      cause: new Error(`Turnstile HTTP ${response.status}`),
    })
  }
  try {
    return (await response.json()) as TurnstileResponse
  } catch (err) {
    throw createHttpError(502, 'CAPTCHA service unavailable', { cause: err })
  }
}

export async function verifyCaptchaToken(
  token: string | undefined,
  ip: string | undefined,
  actionTag: string,
): Promise<void> {
  // Route and integration tests exercise content-creation endpoints without a live
  // Cloudflare siteverify dependency by setting this flag (see the captcha test-skip
  // Vitest setup). Backend startup (backend/entrypoints/api/serve.mts) refuses to boot
  // in production when it is set, so verification is always enforced in production.
  if (process.env.SKIP_CAPTCHA_VERIFICATION === 'true') {
    return
  }

  if (isTurnstileAlwaysApprove()) {
    logTurnstileAlwaysApproveSkip()
    return
  }

  if (!token) {
    throw createHttpError(422, 'CAPTCHA token is required')
  }

  // Dummy keys return provider-controlled context rather than the widget's operation.
  const dummyProvider =
    !isDeployedEnvironment() && CLOUDFLARE_TURNSTILE_TEST_SECRET_KEYS.includes(getSecretKey())
  const result = await fetchTurnstileVerify(token, ip)
  if (result.success !== true) {
    const codes = result['error-codes']?.join(', ')
    throw createHttpError(400, 'CAPTCHA verification failed', {
      cause: codes ? new Error(codes) : undefined,
    })
  }
  // The live dummy endpoint can return its test marker with no action; the documented
  // localhost/test response is also valid. Neither exception applies to deployed services.
  if (
    dummyProvider &&
    result.metadata?.result_with_testing_key === true &&
    result.hostname === 'example.com' &&
    result.action === undefined
  )
    return
  const expectedAction = dummyProvider ? 'test' : toTurnstileAction(actionTag)
  const expectedHostname = dummyProvider
    ? 'localhost'
    : new URL(getSiteOrigin()).hostname.toLowerCase()
  if (result.action !== expectedAction) {
    const cause = new TurnstileContextMismatchError('action', result.action)
    onError(cause)
    throw createHttpError(400, 'CAPTCHA verification failed', { cause })
  }
  if (result.hostname?.toLowerCase() !== expectedHostname) {
    const cause = new TurnstileContextMismatchError('hostname', result.hostname)
    onError(cause)
    throw createHttpError(400, 'CAPTCHA verification failed', { cause })
  }
}

export function extractTurnstileTokenFromBody(
  body: unknown,
  fieldNames: readonly string[] = ['cf_turnstile_response'],
): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined

  const fields = body as Record<string, unknown>
  for (const fieldName of fieldNames) {
    const value = fields[fieldName]
    if (typeof value !== 'string') continue

    const trimmed = value.trim()
    if (trimmed) return trimmed
  }

  return undefined
}
