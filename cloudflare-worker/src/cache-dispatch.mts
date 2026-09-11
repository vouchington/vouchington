import type { UiLocale } from '@ts-shared/languages/ui-locales'
import { withEdgeSessionCookies } from './auth/session-cookies.mts'
import type { ensureSession } from './auth/session-mint.mts'
import type { BotTier } from './bot-tier.mts'
import type { CacheAudience } from './cache-policy.mts'
import { INTERNAL_CACHE_VARY_HEADER, mergeClientVary, parseSafeCacheVary } from './cache-vary.mts'
import { isCachePlaceholderNonceValid } from './env-validation.mts'
import { edgeErrorResponse, withFailureNoStoreHeaders } from './error-response.mts'
import { rewritePlaceholderNonce } from './nonce-rewrite.mts'
import { withHeaders } from './proxy.mts'
import type { RouteTarget } from './routing.mts'
import type { EdgeExecutionContext, Env } from './types.mts'
import { isHtmlResponse, isInvalidWebDocumentResponse } from './web-document-response.mts'
import { INTERNAL_CANARY_FAULT_HEADER } from './staging-control-headers.mts'
import type { StagingCanaryFault } from './staging-canary.mts'

// Internal-only headers on the dispatch RPC request (gateway -> CachedOrigin), read by
// cached-origin.mts. Neither affects the platform cache key — only ctx.props and the
// canonical URL do — and CachedOrigin strips both before any origin-bound request is built,
// so the raw header names never reach the origin or get echoed into cached bytes.
// DISPATCH_BOT_TIER_HEADER, when 'unknown', drives checkBotRateLimit on a genuine cache MISS
// (see its doc comment there). DISPATCH_IP_HEADER carries the client IP the synthetic
// dispatch request otherwise has no way to convey (it's a fresh Request built in
// dispatchToCachedOrigin below, not the original edge request, so it never carries CF's own
// cf-connecting-ip) — CachedOrigin re-derives cf-connecting-ip from it only as
// buildOriginRequest input, which then emits trusted x-forwarded-for and strips
// cf-connecting-ip before origin fetches. This restores parity with the BYPASS
// path's IP-based origin rate-limiting/logging without forwarding raw CF edge
// metadata.
export const DISPATCH_BOT_TIER_HEADER = 'x-voucha-dispatch-bot-tier'
export const DISPATCH_IP_HEADER = 'x-voucha-dispatch-ip'

function restoreClientVary(response: Response, additions: readonly string[]): Response {
  const headers = new Headers(response.headers)
  const tunneledTokens = parseSafeCacheVary(headers.get(INTERNAL_CACHE_VARY_HEADER)) ?? []
  headers.delete(INTERNAL_CACHE_VARY_HEADER)
  const vary = mergeClientVary(headers.get('vary'), [...tunneledTokens, ...additions])
  if (vary === null) headers.delete('vary')
  else headers.set('vary', vary)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

// canDispatchToCache (request-handler.mts) only ever routes target==='web' requests here once
// isCachePlaceholderNonceValid(env.CACHE_PLACEHOLDER_NONCE) has passed, so this should be
// unreachable. Throw instead of falling back to '' — an empty placeholder would make
// rewritePlaceholderNonce split the body on every character, corrupting it.
function requireCachePlaceholderNonce(env: Env): string {
  const { CACHE_PLACEHOLDER_NONCE: nonce } = env
  if (!isCachePlaceholderNonceValid(nonce)) {
    throw new Error(
      'cache-dispatch: CACHE_PLACEHOLDER_NONCE missing or too short on a cacheable web dispatch',
    )
  }
  return nonce
}

export type CacheDispatchInput = {
  audience: CacheAudience
  /** Only 'unknown' ever produces a dispatch header (see below) — known bots and human
   * traffic are never subject to checkBotRateLimit. */
  botTier: BotTier | null
  context: EdgeExecutionContext
  /** Real per-request nonce — swapped in for CachedOrigin's placeholder below. */
  cspNonce: string
  /** Canonical URL (query stripped for sitemap routes) sent to the platform;
   * this — plus `props` — is what Workers Cache keys the shared entry by, so
   * it must never carry per-request-varying data. */
  dispatchUrl: URL
  edgeSession: Awaited<ReturnType<typeof ensureSession>>
  env: Env
  /** Relayed to CachedOrigin whenever present, regardless of botTier — see
   * DISPATCH_IP_HEADER above. */
  ip: string | null
  isProduction: boolean
  isRsc: boolean
  /** Anon-audience UI locale partition (see edge-ui-locale.mts, #6994); omitted for every
   * other audience and whenever it resolves to DEFAULT_UI_LOCALE. */
  lang?: UiLocale
  method: string
  /** Gateway's own request ID (the one echoed to the client as x-request-id).
   * Always relayed as a header so any backend fan-out CachedOrigin's origin fetch
   * triggers on a MISS is traceable back to the client-visible request — never
   * used as a ctx.props dimension, since it must never affect the cache key. */
  requestId: string
  target: RouteTarget
  canaryFault?: StagingCanaryFault | null
}

/**
 * Dispatches a cacheable request to the CachedOrigin entrypoint (see
 * the Wrangler `exports.CachedOrigin` entrypoint and cached-origin.mts) and shapes
 * the response for the client. The RPC request carries only x-request-id,
 * DISPATCH_IP_HEADER (whenever the client IP is known), and — for
 * unknown-bot traffic only — DISPATCH_BOT_TIER_HEADER — so nothing
 * per-request that could vary cached bytes (cookies, the real nonce) ever
 * reaches CachedOrigin. x-request-id and the IP are safe to always relay:
 * neither affects the platform cache key (only ctx.props and the canonical
 * URL do), and CachedOrigin only forwards them to the origin as trace/IP
 * headers, never into cached response bytes. `props` still carries the only
 * dimensions the cache key itself needs (audience, isRsc, lang); these
 * headers are invisible to the platform's cache key.
 */
export async function dispatchToCachedOrigin(input: CacheDispatchInput): Promise<Response> {
  const dispatchHeaders = new Headers()
  if (input.audience === 'anon') {
    dispatchHeaders.set('accept-language', input.lang ?? 'en')
  }
  dispatchHeaders.set('x-request-id', input.requestId)
  if (input.ip) dispatchHeaders.set(DISPATCH_IP_HEADER, input.ip)
  if (input.botTier === 'unknown') {
    dispatchHeaders.set(DISPATCH_BOT_TIER_HEADER, input.botTier)
  }
  if (input.canaryFault) dispatchHeaders.set(INTERNAL_CANARY_FAULT_HEADER, input.canaryFault)
  const dispatchRequest = new Request(input.dispatchUrl.toString(), {
    method: input.method,
    headers: dispatchHeaders,
    // Fetcher.fetch() (the RPC call below) follows redirects like a normal
    // fetch() by default. Without this, a 3xx CachedOrigin returns (e.g. a
    // Next.js redirect() page or next.config redirects()) gets silently
    // auto-followed and re-invoked against CachedOrigin again, so the client
    // sees the *destination's* status instead of the redirect itself.
    redirect: 'manual',
  })
  const dispatchStart = Date.now()
  const cachedResponse = await input.context.exports.CachedOrigin.fetch(dispatchRequest, {
    props: {
      audience: input.audience,
      isRsc: input.isRsc,
      ...(input.lang ? { lang: input.lang } : {}),
    },
  })
  const responseWithClientVary = restoreClientVary(
    cachedResponse,
    input.audience === 'anon' && input.target === 'backend' ? ['Cookie', 'Authorization'] : [],
  )
  // On a real platform HIT, CachedOrigin.fetch never runs (see cached-origin.mts) — this
  // measures RPC/dispatch overhead rather than a true origin fetch duration in that case.
  // There's no way to get a truer number from the gateway's side; an accepted, documented
  // limitation rather than something to solve here.
  const dispatchDuration = Date.now() - dispatchStart

  const isHtml = isHtmlResponse(responseWithClientVary)

  if (
    isInvalidWebDocumentResponse(responseWithClientVary, input.target, input.dispatchUrl.pathname)
  ) {
    return edgeErrorResponse(502, 'Bad Gateway', 'BAD_GATEWAY')
  }

  // Only web HTML carries a nonce to rewrite. `rewritePlaceholderNonce` decodes and transforms
  // the HTML stream, so calling it on a binary web asset (e.g. `/favicon.ico`, which routes to
  // the web origin) would corrupt the bytes. Gate on content-type, not just the web target.
  const rewritten =
    input.target === 'web' && isHtml
      ? await rewritePlaceholderNonce(
          responseWithClientVary,
          requireCachePlaceholderNonce(input.env),
          input.cspNonce,
        )
      : responseWithClientVary

  // The platform cache (Workers Cache) is the caching layer for this response, not the
  // browser: it's one shared entry per anon/bot audience, rewritten per-request (nonce,
  // Set-Cookie) on the way out here — the client must never cache that per-request-rewritten
  // body. Backend JSON is not rewritten per-request. Optional-auth GET endpoints keep their
  // origin Cache-Control, while the outer gateway adds Cookie/Authorization to Vary so a
  // browser cannot reuse anonymous bytes after authentication state changes.
  const isSessionSensitive = isHtml
  const responseForClient = withHeaders(withFailureNoStoreHeaders(rewritten), {
    'server-timing': `origin;dur=${dispatchDuration}`,
    'x-voucha-cache': 'DISPATCHED',
    ...(isSessionSensitive ? { 'cache-control': 'no-store, max-age=0, must-revalidate' } : {}),
  })
  return withEdgeSessionCookies(responseForClient, input.edgeSession, input.isProduction)
}
