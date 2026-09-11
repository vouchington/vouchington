import { createHash, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { isDeployedEnvironment } from '@ts-shared/deploy-environment'
import { getRequestPath } from './app-guard-helpers.mts'
import { BACKEND_BASELINE_RAW_SECURITY_HEADERS } from './security-header-helpers.mts'

// Every entry here bypasses Cloudflare's worker-secret check, so it must be a caller that
// cannot supply the secret (an AWS-signed webhook, a health check) — see
// docs/overview/architecture/event-ingress.md. Do not add a new entry without updating that doc.
export const WORKER_SECRET_EXEMPT_PATHS = new Set(['/infra/ping'])
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

type HttpListener = (req: IncomingMessage, res: ServerResponse) => void

export function createOriginGuardedListener(
  listener: HttpListener,
  secret: string | undefined = undefined,
): HttpListener {
  const secretHash = hashWorkerSecret(secret)
  return (req, res) => {
    if (!preflightOriginRequest(req, res, secretHash)) return
    listener(req, res)
  }
}

function preflightOriginRequest(
  req: IncomingMessage,
  res: ServerResponse,
  secretHash: Buffer | null,
): boolean {
  if (rejectInvalidWorkerSecret(req, res, secretHash)) return false
  if (!isCrossSiteMutation(req, req.method ?? 'GET')) return true
  writeForbidden(res)
  logGuardRejectedRequest(req, 'cross-site mutation')
  return false
}

function hashWorkerSecret(secret: string | undefined): Buffer | null {
  return secret ? createHash('sha256').update(secret).digest() : null
}

function rejectInvalidWorkerSecret(
  req: IncomingMessage,
  res: ServerResponse,
  secretHash: Buffer | null,
): boolean {
  if (!secretHash) return false
  const method = req.method ?? 'GET'
  const pathOnly = getRequestPath(req.url ?? '/')
  if (WORKER_SECRET_EXEMPT_PATHS.has(pathOnly)) return false

  const headerVal = req.headers['x-cf-worker-secret']
  const headerHash = createHash('sha256')
    .update(typeof headerVal === 'string' ? headerVal : '')
    .digest()
  if (timingSafeEqual(headerHash, secretHash)) return false
  logGuardRejectedRequest(req, 'invalid worker secret', {
    path: pathOnly,
    method,
    hasHeader: typeof headerVal === 'string',
  })
  writeForbidden(res)
  return true
}

function writeForbidden(res: ServerResponse): void {
  res.writeHead(403, {
    'content-type': 'text/plain',
    ...BACKEND_BASELINE_RAW_SECURITY_HEADERS,
  })
  res.end('Forbidden')
}

function logGuardRejectedRequest(
  req: IncomingMessage,
  reason: string,
  details: Record<string, unknown> = {},
): void {
  if (process.env.NODE_ENV === 'test') return
  /* v8 ignore next -- production-only diagnostic side effect. */
  console.error('Origin validation failed — request rejected', {
    reason,
    path: getRequestPath(req.url ?? '/'),
    method: req.method ?? 'GET',
    ...details,
  })
}

function isCrossSiteMutation(req: IncomingMessage, method: string): boolean {
  if (!MUTATING_METHODS.has(method)) return false
  if (hasBearerAuth(req.headers.authorization)) return false

  const secFetchSite = headerValue(req.headers['sec-fetch-site'])?.toLowerCase()
  if (secFetchSite === 'cross-site') return true
  if (secFetchSite === 'same-origin' || secFetchSite === 'same-site') return false

  const origin = headerValue(req.headers.origin)
  // Server-to-server callers (webhooks, signed callbacks) carry no browser-context signals —
  // no Sec-Fetch-Site, no Origin, no session cookie. They authenticate by signature/shared key,
  // not cookies, so they are not CSRF vectors. Any request with a browser signal falls through
  // to strict origin validation, which now covers pre-auth routes (login/signup) too.
  if (!origin && !secFetchSite && !hasSessionCookie(req.headers.cookie)) return false
  if (!origin) return true

  const forwardedHost = headerValue(req.headers['x-forwarded-host'])
  const host = forwardedHost ?? headerValue(req.headers.host)
  if (!host) return true

  const forwardedProto = headerValue(req.headers['x-forwarded-proto'])
  const proto = (forwardedProto ?? (isDeployedEnvironment() ? 'https' : 'http')).toLowerCase()
  const requestOrigin = canonicalOrigin(origin)
  const expectedOrigin = canonicalOrigin(`${proto}://${host}`)
  if (!requestOrigin || !expectedOrigin) return true

  return requestOrigin !== expectedOrigin
}

function hasSessionCookie(cookieHeader: string | undefined): boolean {
  return /(?:^|;\s*)(?:dt|st)=/.test(cookieHeader ?? '')
}

function hasBearerAuth(header: string | string[] | undefined): boolean {
  const value = headerValue(header)
  return value?.toLowerCase().startsWith('bearer ') ?? false
}

function headerValue(header: string | string[] | undefined): string | undefined {
  const value = Array.isArray(header) ? header[0] : header
  return value?.split(',')[0]?.trim()
}

function normalizeDefaultPort(host: string, proto: string): string {
  if (proto === 'https') return host.replace(/:443$/, '')
  if (proto === 'http') return host.replace(/:80$/, '')
  return host
}

function canonicalOrigin(origin: string): string | null {
  try {
    const url = new URL(origin)
    return `${url.protocol}//${normalizeDefaultPort(url.host, url.protocol.slice(0, -1))}`
  } catch {
    return null
  }
}
