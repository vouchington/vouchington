// Backend -> worker cache-purge trigger (Workers Cache GA tag-based purge — see plan's
// Cache-Tag section). The backend mints Cache-Tags from entity IDs/slugs on mutation
// (`@services/entity-cache/invalidate.mts`) and POSTs them here; this route forwards them
// into the RPC-only `purge()` method on the `CachedOrigin` entrypoint (cached-origin.mts),
// since purge is entrypoint-scoped and only `CachedOrigin` can purge its own cache.
//
// Auth: gated by the same `CF_WORKER_SECRET` value already used for the (opposite-direction)
// worker -> backend origin guard (see dashboard-auth.mts's createWorkerSecretValidator()).
// A distinct header name is used here — `x-cf-worker-secret` is the established name for the
// worker-forwards-to-backend direction (proxy.mts/origin-request.mts); reusing it for this
// reverse direction would be misleading. No new secret needs provisioning: the value is
// already a private-infrastructure-managed Cloudflare Worker secret and readable by the backend via
// `process.env.CF_WORKER_SECRET`.

import { timingSafeCredentialMatch } from './basic-auth.mts'
import { edgeErrorResponse } from './error-response.mts'
import type { EdgeExecutionContext, Env } from './types.mts'
import { CACHE_PURGE_SECRET_HEADER, MAX_TAGS_PER_REQUEST } from '@ts-shared/cache/purge'
import type { StagingCanaryFault } from './staging-canary.mts'

function isValidTagList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= MAX_TAGS_PER_REQUEST &&
    value.every(tag => typeof tag === 'string' && tag.length > 0)
  )
}

async function parseCachePurgeTags(request: Request): Promise<string[] | null> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return null
  }
  if (typeof body !== 'object' || body === null) return null
  const tags = (body as Record<string, unknown>).tags
  return isValidTagList(tags) ? tags : null
}

/**
 * Handles `POST /infra/cache-purge`. Exempted from staging Basic Auth in basic-auth.mts
 * (its own secret header is the auth mechanism) and intercepted in request-handler.mts
 * before generic `/infra/*` routing, since — unlike other `/infra/*` paths — this one is
 * handled entirely in-worker rather than proxied to the backend origin.
 */
export async function handleCachePurgeRequest(
  request: Request,
  env: Env,
  context: EdgeExecutionContext,
  canaryFault: StagingCanaryFault | null = null,
): Promise<Response> {
  if (!env.CF_WORKER_SECRET) {
    return edgeErrorResponse(503, 'Service Unavailable', 'SERVICE_UNAVAILABLE')
  }
  const providedSecret = request.headers.get(CACHE_PURGE_SECRET_HEADER) ?? ''
  if (!timingSafeCredentialMatch(providedSecret, new Set([env.CF_WORKER_SECRET]))) {
    return edgeErrorResponse(401, 'Unauthorized', 'UNAUTHORIZED')
  }

  const tags = await parseCachePurgeTags(request)
  if (!tags) {
    return edgeErrorResponse(400, 'Invalid request body', 'INVALID_INPUT')
  }

  let result
  try {
    if (canaryFault === 'purge-reject') throw new Error('Injected cache purge rejection')
    result = await context.exports.CachedOrigin.purge(tags)
  } catch (error) {
    console.error('Cache purge threw:', error)
    return edgeErrorResponse(502, 'Cache purge failed', 'BAD_GATEWAY')
  }
  if (!result.success) {
    console.error('Cache purge rejected:', result.errors)
    return edgeErrorResponse(502, 'Cache purge failed', 'BAD_GATEWAY')
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}
