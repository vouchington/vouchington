import type { IncomingMessage, ServerResponse } from 'node:http'
import { isIP } from 'node:net'
import {
  ClientInfoValidationError,
  parseClientHeaders,
  VOUCHA_REQUEST_KIND_HEADER,
  type RequestClientInfo,
} from '@ts-shared/request-client-info'
import { mintUUIDv7, verifyDeviceJwt } from '@ts-shared/session-jwt'
import {
  cacheBootstrapDeviceId,
  cacheVerifiedDeviceToken,
  runWithRequestClientInfo,
  type VerifiedDeviceIdentity,
} from './index.mts'

type HttpListener = (req: IncomingMessage, res: ServerResponse) => void
const TRUSTED_REQUEST_KINDS = new Set(['bot', 'cache-fill'])
const EXEMPT_API_PREFIXES = [
  '/api/v1/mcp',
  '/api/v1/admin/mcp',
  '/api/v1/email-unsubscribe',
  '/api/v1/crm/unsubscribe',
]
const NATIVE_BOOTSTRAP_PATHS = new Set([
  '/api/v1/auth/email-address/tokens',
  '/api/v1/auth/email-address/login',
  '/api/v1/auth/mfa/totp/verification',
  '/api/v1/auth/passkeys/authentication/options',
  '/api/v1/auth/passkeys/authentication/verify',
  '/api/v1/auth/oauth/apple/continue',
  '/api/v1/app-attestation/challenge',
  '/api/v1/app-attestation/attest',
])
type ListenerDependencies = {
  isEnforced: () => boolean
  mintDeviceId: typeof mintUUIDv7
  verifyDeviceIdentity: (
    deviceToken: string,
    sessionToken: string | undefined,
  ) => Promise<VerifiedDeviceIdentity | null>
}

export function createRequestClientInfoListener(
  listener: HttpListener,
  dependencies: ListenerDependencies = {
    isEnforced: () => false,
    mintDeviceId: mintUUIDv7,
    verifyDeviceIdentity: deviceToken => verifyDeviceJwt(deviceToken),
  },
): HttpListener {
  return (req, res) => {
    void handleRequest(req, res, listener, dependencies)
  }
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  listener: HttpListener,
  dependencies: ListenerDependencies,
): Promise<void> {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname
  if (isExempt(req, path)) {
    listener(req, res)
    return
  }
  try {
    const headers = parseClientHeaders(req.headers)
    const deviceToken = await getTrustedDeviceToken(req, dependencies.verifyDeviceIdentity)
    const requestId = firstInfrastructureHeaderValue(req.headers['x-request-id'])
    const bootstrapDeviceId = deviceToken
      ? undefined
      : getBootstrapDeviceId(req, path, dependencies)
    if (!deviceToken && !bootstrapDeviceId) {
      throw new ClientInfoValidationError('a verified device token is required')
    }
    const value: RequestClientInfo = {
      ...headers,
      deviceId: deviceToken?.did ?? bootstrapDeviceId!,
      ipAddress: getTrustedIpAddress(req),
      ...(requestId ? { requestId } : {}),
    }
    runWithRequestClientInfo(value, () => listener(req, res))
  } catch (error) {
    logInvalidClientInfo(path, error)
    if (!dependencies.isEnforced()) {
      listener(req, res)
      return
    }
    if (!res.headersSent) writeInvalidClientInfo(res, req, error)
  }
}

function getBootstrapDeviceId(
  req: IncomingMessage,
  path: string,
  dependencies: ListenerDependencies,
): string | undefined {
  const isSessionBootstrap = req.method === 'PATCH' && path === '/api/v1/session'
  const isNativeBootstrap = req.method === 'POST' && NATIVE_BOOTSTRAP_PATHS.has(path)
  if (!isSessionBootstrap && !isNativeBootstrap) return undefined
  const deviceId = dependencies.mintDeviceId()
  cacheBootstrapDeviceId(req, deviceId)
  return deviceId
}

function isExempt(req: IncomingMessage, path: string): boolean {
  if (req.method === 'OPTIONS') return true
  if (!path.startsWith('/api/')) return true
  if (EXEMPT_API_PREFIXES.some(prefix => isExactOrSubpath(path, prefix))) return true
  const kind = singleHeader(req.headers[VOUCHA_REQUEST_KIND_HEADER])
  return kind !== undefined && TRUSTED_REQUEST_KINDS.has(kind)
}

async function getTrustedDeviceToken(
  req: IncomingMessage,
  verifyIdentity: ListenerDependencies['verifyDeviceIdentity'],
) {
  const deviceToken = parseCookie(req.headers.cookie, 'dt')
  if (!deviceToken) return undefined
  const sessionToken = parseCookie(req.headers.cookie, 'st')
  const payload = await verifyIdentity(deviceToken, sessionToken)
  if (payload) cacheVerifiedDeviceToken(req, deviceToken, payload)
  return payload
}

function getTrustedIpAddress(req: IncomingMessage): string {
  const address =
    firstForwardedIp(req.headers['x-forwarded-for']) ??
    singleHeader(req.headers['cf-connecting-ip']) ??
    req.socket.remoteAddress
  if (!address || isIP(address) === 0) {
    throw new ClientInfoValidationError('a valid client IP address is required')
  }
  return address
}

function isExactOrSubpath(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`)
}

function firstForwardedIp(value: string | string[] | undefined): string | undefined {
  return singleHeader(value)?.split(',')[0]?.trim()
}

function singleHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? undefined : value
}

function firstInfrastructureHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function parseCookie(cookie: string | undefined, name: string): string | undefined {
  for (const part of cookie?.split(';') ?? []) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) return value.join('=')
  }
  return undefined
}

function writeInvalidClientInfo(res: ServerResponse, req: IncomingMessage, error: unknown): void {
  const requestId = firstInfrastructureHeaderValue(req.headers['x-request-id'])
  res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
  res.end(
    JSON.stringify({
      message: error instanceof Error ? error.message : 'Invalid client information',
      code: 'INVALID_CLIENT_INFO',
      ...(requestId ? { request_id: requestId } : {}),
    }),
  )
}

function logInvalidClientInfo(path: string, error: unknown): void {
  if (process.env.NODE_ENV === 'test') return
  console.warn('Invalid request client information observed', {
    path,
    reason: error instanceof Error ? error.message : 'unknown',
  })
}
