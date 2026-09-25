import { edgeErrorResponse } from './error-response.mts'
import { getIdentityRateLimitRejection } from './identity-rate-limit-rejection.mts'
import { STAGING_AUTHORIZATION_HEADER } from './staging-control-headers.mts'
import {
  basicAuthorizationMatches,
  readBasicAuthCredentialList,
} from './basic-auth-credentials.mts'
import { isExternalServerToServerIngress } from './external-server-ingress.mts'
import type { Env } from './types.mts'

export { STAGING_AUTHORIZATION_HEADER }
export { timingSafeCredentialMatch } from './timing-safe-credential-match.mts'

const warnedMalformedCredentialValues = new Set<string>()

/**
 * Parses a comma-separated list of `user:password` pairs from an env var.
 * Returns a Set of decoded `user:password` strings, or null only when the
 * value is empty/unset (gate disabled). When the value is non-empty and any
 * entry is malformed, returns an empty Set — the gate remains ENABLED and all
 * requests receive 401 (fail-closed). Multiple entries support credential
 * rotation: add a new pair, deploy, then remove the retired pair on the next
 * rotation. Constraint: usernames and passwords must not contain a comma, and
 * whitespace is significant rather than separator padding.
 *
 * Results are cached at module scope so parsing and any console.warn calls
 * happen only once per unique env value rather than on every request.
 */
export function parseBasicAuthCredentials(envValue: string | undefined): Set<string> | null {
  const list = readBasicAuthCredentialList(envValue)
  if (list.status === 'absent') return null
  if (list.hasMalformedEntries && !warnedMalformedCredentialValues.has(list.source)) {
    warnedMalformedCredentialValues.add(list.source)
    console.warn(
      '[Basic Auth] Rejecting malformed credential list (username and password must both be non-empty)',
    )
  }
  if (list.hasMalformedEntries) return new Set()
  return list.credentials
}

/**
 * Paths exempt from the basic-auth gate. Most are hit by external machine
 * callers that authenticate via their own mechanism (HMAC signature, Bearer
 * API key, SNS signature) and cannot supply HTTP Basic Auth credentials — the
 * bearer/HMAC auth on those paths remains in force. `/manifest.webmanifest` is
 * different: the HTML/manifest spec requires browsers to fetch it with
 * credentials omitted unless the `<link>` carries `crossorigin="use-credentials"`,
 * so no cached Basic Auth credential is ever offered even by an authenticated
 * browser. Exemptions are scoped to the HTTP method the origin route actually
 * serves so wrong-method probes do not bypass staging Basic Auth before
 * reaching origin-level 404/405 handling.
 *
 * NOTE: This Set is not used at runtime. It exists for static analysis
 * (basic-auth-doc-sync guard) and test synchronization assertions. The runtime
 * exemption source of truth is BASIC_AUTH_EXEMPT_METHODS_BY_PATH below.
 */
const BASIC_AUTH_EXEMPT_PATHS = new Set([
  '/api/v1/mcp',
  '/api/v1/admin/mcp',
  '/api/v1/memberships/apple-app-store/notifications',
  '/api/v1/memberships/google-play/notifications',
  '/.well-known/webfinger',
  '/.well-known/nodeinfo',
  '/.well-known/oauth-authorization-server',
  '/.well-known/oauth-protected-resource/api/v1/mcp',
  '/.well-known/oauth-protected-resource/api/v1/admin/mcp',
  '/nodeinfo/2.0',
  '/ap/users/{id}',
  '/ap/inbox',
  '/client-metadata.json',
  '/auth/callback/facebook/broker',
  '/auth/callback/x/broker',
  '/auth/callback/github/broker',
  '/register',
  '/revoke',
  '/token',
  '/infra/ping',
  '/infra/cache-purge',
  '/manifest.webmanifest',
])

const BASIC_AUTH_EXEMPT_METHODS_BY_PATH: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['/api/v1/mcp', new Set(['POST'])],
  ['/api/v1/admin/mcp', new Set(['POST'])],
  ['/api/v1/memberships/apple-app-store/notifications', new Set(['POST'])],
  ['/api/v1/memberships/google-play/notifications', new Set(['POST'])],
  ['/.well-known/webfinger', new Set(['GET'])],
  ['/.well-known/nodeinfo', new Set(['GET'])],
  ['/.well-known/oauth-authorization-server', new Set(['GET'])],
  ['/.well-known/oauth-protected-resource/api/v1/mcp', new Set(['GET'])],
  ['/.well-known/oauth-protected-resource/api/v1/admin/mcp', new Set(['GET'])],
  ['/nodeinfo/2.0', new Set(['GET'])],
  ['/ap/users/{id}', new Set(['GET'])],
  ['/ap/inbox', new Set(['POST'])],
  ['/client-metadata.json', new Set(['GET'])],
  ['/auth/callback/facebook/broker', new Set(['GET'])],
  ['/auth/callback/x/broker', new Set(['GET'])],
  ['/auth/callback/github/broker', new Set(['GET'])],
  ['/register', new Set(['POST'])],
  ['/revoke', new Set(['POST'])],
  ['/token', new Set(['POST'])],
  ['/infra/ping', new Set(['GET', 'HEAD'])],
  ['/infra/cache-purge', new Set(['POST'])],
  ['/manifest.webmanifest', new Set(['GET', 'HEAD'])],
])

export const basicAuthTestExports = {
  BASIC_AUTH_EXEMPT_PATHS,
  BASIC_AUTH_EXEMPT_METHODS_BY_PATH,
} as const

const ACTIVITYPUB_ACTOR_PATH_RE =
  /^\/ap\/users\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export function isBasicAuthExemptRequest(method: string, pathname: string): boolean {
  const normalized =
    pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  const normalizedPath = normalized.toLowerCase()
  if (isExternalServerToServerIngress(method, normalizedPath)) return true
  const allowedMethods = BASIC_AUTH_EXEMPT_METHODS_BY_PATH.get(normalizedPath)
  const normalizedMethod = method.toUpperCase()
  if (allowedMethods?.has(normalizedMethod)) return true

  const actorMethods = BASIC_AUTH_EXEMPT_METHODS_BY_PATH.get('/ap/users/{id}')
  return (
    actorMethods?.has(normalizedMethod) === true && ACTIVITYPUB_ACTOR_PATH_RE.test(normalizedPath)
  )
}

function appliesBasicAuthGate(request: Request, env: Env, url: URL): boolean {
  const creds = parseBasicAuthCredentials(env.BASIC_AUTH_CREDENTIALS)
  return creds !== null && !isBasicAuthExemptRequest(request.method, url.pathname)
}

export async function getBasicAuthRateLimitRejection(
  request: Request,
  env: Env,
  url: URL,
  ip: string | null,
): Promise<{ applies: boolean; response: Response | null }> {
  const applies = appliesBasicAuthGate(request, env, url)
  if (!applies) return { applies, response: null }
  const response = await getIdentityRateLimitRejection(
    env,
    request.method,
    url.pathname,
    ip,
    false,
    null,
    false,
  )
  return { applies, response }
}

/**
 * Returns a 401 challenge response when basic auth is enabled and the request
 * does not supply a valid credential, or null to pass the request through.
 *
 * The gate is disabled (returns null) when BASIC_AUTH_CREDENTIALS is unset —
 * production and local environments never set it.
 */
export function getBasicAuthResponse(request: Request, env: Env, url: URL): Response | null {
  const creds = parseBasicAuthCredentials(env.BASIC_AUTH_CREDENTIALS)
  if (!creds) return null

  if (isBasicAuthExemptRequest(request.method, url.pathname)) return null

  const primary = request.headers.get('authorization')
  const secondary = request.headers.get(STAGING_AUTHORIZATION_HEADER)
  const ordinaryBasic = primary !== null && /^Basic\s/i.test(primary) && secondary === null
  const dualBearer = primary !== null && /^Bearer\s+\S+$/i.test(primary) && secondary !== null
  const basicCandidate = ordinaryBasic ? primary : dualBearer ? secondary : null
  if (basicAuthorizationMatches(basicCandidate, creds)) return null

  return edgeErrorResponse(401, 'Authentication required', 'UNAUTHORIZED', {
    'www-authenticate': 'Basic realm="Voucha Staging", charset="UTF-8"',
  })
}
