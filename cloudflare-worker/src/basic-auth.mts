import { createBasicAuthGate, type BasicAuthGate } from '@vouchington/edge'
import { getIdentityRateLimitRejection } from './identity-rate-limit-rejection.mts'
import { STAGING_AUTHORIZATION_HEADER } from './staging-control-headers.mts'
import { isExternalServerToServerIngress } from './external-server-ingress.mts'
import type { Env } from './types.mts'

export { STAGING_AUTHORIZATION_HEADER }

export const INTERNAL_REFERENCE_BASIC_AUTH_CHALLENGE =
  'Basic realm="Voucha Internal References", charset="UTF-8"'
// A gate captures one deployment credential value. Reuse it across requests so a malformed
// rotation list warns once per isolate, including during the pre-auth rate-limit decision.
const gatesByCredentials = new Map<string | undefined, BasicAuthGate>()

function basicAuthGate(credentials: string | undefined): BasicAuthGate {
  let gate = gatesByCredentials.get(credentials)
  if (!gate) {
    gate = createBasicAuthGate({
      credentials,
      realm: 'Voucha Staging',
      secondaryAuthorizationHeader: STAGING_AUTHORIZATION_HEADER,
      isExempt: isBasicAuthExemptRequest,
    })
    gatesByCredentials.set(credentials, gate)
  }
  return gate
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
 */
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
  ['/auth/callback/google/broker', new Set(['GET'])],
  ['/auth/callback/linkedin/broker', new Set(['GET'])],
  ['/auth/callback/microsoft/broker', new Set(['GET'])],
  ['/register', new Set(['POST'])],
  ['/revoke', new Set(['POST'])],
  ['/token', new Set(['POST'])],
  ['/infra/ping', new Set(['GET', 'HEAD'])],
  ['/infra/cache-purge', new Set(['POST'])],
  ['/manifest.webmanifest', new Set(['GET', 'HEAD'])],
])

export const basicAuthTestExports = {
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

function appliesBasicAuthGate(request: Request, env: Env): boolean {
  return basicAuthGate(env.BASIC_AUTH_CREDENTIALS).appliesTo(request)
}

export async function getBasicAuthRateLimitRejection(
  request: Request,
  env: Env,
  url: URL,
  ip: string | null,
): Promise<{ applies: boolean; response: Response | null }> {
  const applies = appliesBasicAuthGate(request, env)
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
export function getBasicAuthResponse(request: Request, env: Env, _url: URL): Response | null {
  return basicAuthGate(env.BASIC_AUTH_CREDENTIALS).check(request)
}
