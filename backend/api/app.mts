import { STATUS_CODES, type IncomingMessage, type ServerResponse } from 'node:http'
import { verifyDeviceJwt, type DeviceTokenPayload } from '@ts-shared/session-jwt'
import { v7 } from 'uuid'
import { createApp, type Application, type ApplicationOptions } from '@jongleberry/api-server'
import onError from '@modules/on-error'
import { createRequestClientInfoListener } from '@modules/request-client-info/listener'
import { isRequestClientInfoEnforced } from '@services/request-client-info'
import { verifyDeviceAndSessionTokens } from '@services/jwt-session'
import { createOriginGuardedListener as createListenerWithOriginGuard } from './app-origin-guard.mts'
import applyContext from './context/index.mts'
import applyRateLimitContext from './context/rate-limit.mts'
import applyRequestVerificationContext from './context/request-verification.mts'
import { VOUCHA_API_SECURITY_HEADERS } from './security-header-helpers.mts'
import {
  getErrorResponseCode,
  getErrorResponseMessage,
  getErrorResponseStack,
  getErrorStatus,
  normalizeErrorForLogging,
} from './error-response.mts'

type HttpListener = (req: IncomingMessage, res: ServerResponse) => void

export {
  getErrorResponseCode,
  getErrorResponseMessage,
  getErrorResponseStack,
  getErrorStatus,
  normalizeErrorForLogging,
} from './error-response.mts'

const cfWorkerSecret = process.env.CF_WORKER_SECRET
const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'
if (!cfWorkerSecret) {
  if (!isDev) {
    throw new Error(
      'CF_WORKER_SECRET is not set — refusing to start with origin validation disabled',
    )
  }
  if (process.env.NODE_ENV === 'development') {
    console.warn('CF_WORKER_SECRET not set — origin validation disabled (dev)')
  }
} else if (cfWorkerSecret.length < 32) {
  if (!isDev) {
    throw new Error(
      'CF_WORKER_SECRET is too short (minimum 32 characters) — generate with: openssl rand -hex 32',
    )
  }
  if (process.env.NODE_ENV === 'development') {
    console.warn(
      'CF_WORKER_SECRET is too short (minimum 32 characters) — origin validation degraded (dev)',
    )
  }
}

export const VOUCHA_API_SERVER_OPTIONS = {
  trustProxy: true,
  strictHttpMethods: false,
  bodyLimit: 1024 * 1024,
  oversizedBodyStrategy: 'drain',
  fallbackContentSecurityPolicy: false,
  securityHeaders: VOUCHA_API_SECURITY_HEADERS,
} as const satisfies ApplicationOptions

const app = createVouchaApiApp()

export default app

export function createVouchaApiApp(): Application {
  return createApp(VOUCHA_API_SERVER_OPTIONS)
}

export function createOriginGuardedListener(
  listener: HttpListener,
  secret: string | undefined = cfWorkerSecret,
): HttpListener {
  return createListenerWithOriginGuard(createApiRequestGuardedListener(listener), secret)
}

export function createApiRequestGuardedListener(listener: HttpListener): HttpListener {
  return createRequestClientInfoListener(listener, {
    isEnforced: isRequestClientInfoEnforced,
    mintDeviceId: v7,
    verifyDeviceIdentity: verifyRequestDeviceIdentity,
  })
}

export async function verifyRequestDeviceIdentity(
  deviceToken: string,
  sessionToken: string | undefined,
  dependencies: {
    verifyDevice: typeof verifyDeviceJwt
    verifyPair: typeof verifyDeviceAndSessionTokens
  } = { verifyDevice: verifyDeviceJwt, verifyPair: verifyDeviceAndSessionTokens },
): Promise<Pick<DeviceTokenPayload, 'did' | 'dc'> | null> {
  const paired = sessionToken ? await dependencies.verifyPair({ deviceToken, sessionToken }) : null
  const verified = paired || (await dependencies.verifyDevice(deviceToken))
  return verified ? { did: verified.did, dc: verified.dc } : null
}

applyContext(app)
applyRateLimitContext(app)
applyRequestVerificationContext(app)
app.on('error', (err: Error) => onError(normalizeErrorForLogging(err)))

app.errorHandler((ctx, error: unknown) => {
  if (ctx.res.headersSent) return
  const status = getErrorStatus(error)
  const env = process.env.NODE_ENV ?? 'development'
  const rawRequestId = ctx.req.headers['x-request-id']
  const requestId = Array.isArray(rawRequestId) ? rawRequestId[0] : rawRequestId
  ctx.setStatus(status)
  if (env === 'production' && status >= 500) {
    ctx.json({
      message: STATUS_CODES[status] ?? 'Internal Server Error',
      code: 'INTERNAL_ERROR',
      ...(requestId ? { request_id: requestId } : {}),
    })
    return
  }
  const message = getErrorResponseMessage(error, status)
  const code = getErrorResponseCode(error, status)
  ctx.json({
    message,
    ...(code ? { code } : {}),
    ...(requestId ? { request_id: requestId } : {}),
    ...(env !== 'production' ? { stack: getErrorResponseStack(error) } : {}),
  })
})

app.notFoundHandler(ctx => {
  ctx.setStatus(404)
  ctx.json({ message: 'Not Found', code: 'NOT_FOUND' })
})
