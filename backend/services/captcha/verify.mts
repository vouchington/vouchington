import onError from '@modules/on-error'
import { toTurnstileAction } from '@ts-shared/utils/turnstile-action'
import { getSiteOrigin } from '@modules/utils/site-origin'
import { isDeployedEnvironment } from '@ts-shared/deploy-environment'
import createHttpError from 'http-errors'
import { getExternalFetch } from '@modules/utils/http'
import {
  type TurnstileContextMismatch,
  findTurnstileContextMismatches,
  verifyTurnstileToken,
} from '@vouchington/utils/turnstile-siteverify'
import { isTurnstileAlwaysApprove, logTurnstileAlwaysApproveSkip } from './config.mts'
import { getTurnstileSecretKey, isTurnstileTestSecretKey } from './secret-keys.mts'

class TurnstileContextMismatchError extends Error {
  readonly code: string
  readonly extra: Record<string, string | null>

  constructor({ field, received }: TurnstileContextMismatch) {
    super(`Turnstile ${field} does not match`)
    this.code = `turnstile_${field}_mismatch`
    this.extra = field === 'action' ? { receivedAction: received } : { receivedHostname: received }
  }
}

/* no-mistakes: integration=http */
export async function verifyCaptchaToken(
  token: string | undefined,
  ip: string | undefined,
  actionTag: string,
  options: { createMissingTokenError?: () => Error } = {},
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
    if (options.createMissingTokenError) throw options.createMissingTokenError()
    throw createHttpError(422, 'CAPTCHA token is required')
  }

  // Dummy keys return provider-controlled context rather than the widget's operation.
  const secret = getTurnstileSecretKey()
  const dummyProvider = !isDeployedEnvironment() && isTurnstileTestSecretKey(secret)
  const result = await verifyTurnstileToken({
    fetch: getExternalFetch(),
    secret,
    token,
    remoteIp: ip,
  })
  if (result.status === 'error') {
    throw createHttpError(502, 'CAPTCHA service unavailable', {
      cause: new Error(result.failure.message, { cause: result.failure.cause }),
    })
  }
  if (result.status === 'rejected') {
    throw createHttpError(400, 'CAPTCHA verification failed', {
      cause: new Error(result.errorCodes.join(', ') || result.reason),
    })
  }
  // The live dummy endpoint can return its test marker with no action; the documented
  // localhost/test response is also valid. Neither exception applies to deployed services.
  if (
    dummyProvider &&
    result.resultWithTestingKey &&
    result.hostname === 'example.com' &&
    result.action === null
  )
    return
  const [mismatch] = findTurnstileContextMismatches(result, {
    action: dummyProvider ? 'test' : toTurnstileAction(actionTag),
    hostname: dummyProvider ? 'localhost' : new URL(getSiteOrigin()).hostname,
  })
  if (mismatch) {
    const cause = new TurnstileContextMismatchError(mismatch)
    onError(cause)
    throw createHttpError(400, 'CAPTCHA verification failed', { cause })
  }
}
