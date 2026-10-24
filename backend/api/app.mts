import type { IncomingMessage, ServerResponse } from 'node:http'
import { verifyDeviceJwt, type DeviceTokenPayload } from '@ts-shared/session-jwt'
import { v7 } from 'uuid'
import { createApp, type Application, type ApplicationOptions } from '@jongleberry/api-server'
import onError from '@modules/on-error'
import { createRequestClientInfoListener } from '@modules/request-client-info/listener'
import { isRequestClientInfoEnforced } from '@services/request-client-info'
import { verifyDeviceAndSessionTokens } from '@services/jwt-session'
import { createOriginGuardedListener as createListenerWithOriginGuard } from './app-origin-guard.mts'
import { createRequestContextListener } from './context/request-context.mts'
import applyContext from './context/index.mts'
import applyRateLimitContext from './context/rate-limit.mts'
import applyRequestVerificationContext from './context/request-verification.mts'
import { VOUCHA_API_SECURITY_HEADERS } from './security-header-helpers.mts'
import { installRequestContractEnforcement } from './request-contract-enforcement-helpers.mts'
import { buildApiErrorEnvelope, normalizeErrorForLogging } from '@vouchington/utils/api-errors'

type HttpListener = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>

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
  const app = createApp(VOUCHA_API_SERVER_OPTIONS)
  installRequestContractEnforcement(app, onError)
  return app
}

export function createOriginGuardedListener(
  listener: HttpListener,
  secret: string | undefined = cfWorkerSecret,
): HttpListener {
  return createListenerWithOriginGuard(createApiRequestGuardedListener(listener), secret)
}

export function createApiRequestGuardedListener(
  listener: HttpListener,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return createRequestContextListener(
    createRequestClientInfoListener(listener, {
      isEnforced: isRequestClientInfoEnforced,
      mintDeviceId: v7,
      verifyDeviceIdentity: verifyRequestDeviceIdentity,
    }),
  )
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
  const env = process.env.NODE_ENV ?? 'development'
  const rawRequestId = ctx.req.headers['x-request-id']
  const requestId = Array.isArray(rawRequestId) ? rawRequestId[0] : rawRequestId
  const { status, body } = buildApiErrorEnvelope(error, {
    exposeDetails: env !== 'production',
    requestId,
  })
  ctx.setStatus(status)
  if (
    status === 422 &&
    body.code === 'community_list_feed_limit_reached' &&
    error instanceof Error &&
    'limit' in error &&
    typeof error.limit === 'number'
  ) {
    ctx.json({ ...body, limit: error.limit })
  } else {
    ctx.json(body)
  }
})

app.notFoundHandler(ctx => {
  ctx.setStatus(404)
  ctx.json({ message: 'Not Found', code: 'NOT_FOUND' })
})
