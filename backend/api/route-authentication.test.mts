import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { isTestRegisteredRoute } from '@voucha/test-helpers/api/request-contract-enforcement'
import app from './app.mts'

// Deny-list: every registered route must answer an anonymous request with 401 unless it is named
// below with the reason an anonymous caller may reach it. Route handlers carry no auth metadata
// (each one calls `requireAuth` or a sibling itself), so the only way to see whether a handler
// authenticates is to send it a request. A route added without authentication answers something
// other than 401 and fails here until it is fixed or declared public with a reason.
//
// HEAD is skipped: the router derives it from GET, so it answers whatever GET does.

const PUBLIC_ROUTES: Readonly<Record<string, readonly string[]>> = {
  'public reads of content, directories and reference data an anonymous visitor may browse': [
    'GET /api/v1/posts',
    'GET /api/v1/posts/:idOrSlug',
    'GET /api/v1/posts/:idOrSlug/ancestors',
    'GET /api/v1/posts/:idOrSlug/descendants',
    'GET /api/v1/posts/:idOrSlug/images',
    'GET /api/v1/posts/:postId/dispute-annotation',
    'GET /api/v1/podcast-episodes/:id/chapters',
    'GET /api/v1/stories/:id',
    'GET /api/v1/topics',
    'GET /api/v1/topics/compare',
    'GET /api/v1/topics/publisher-types',
    'GET /api/v1/topics/:id/prioritized-referral-links',
    'GET /api/v1/topics/:idOrSlug',
    'GET /api/v1/topics/:idOrSlug/card',
    'GET /api/v1/topics/:idOrSlug/referral-program/validation-info',
    'GET /api/v1/topics/:idOrSlug/retailer',
    'GET /api/v1/topics/:idOrSlug/retailer/countries',
    'GET /api/v1/topics/:idOrSlug/rewards-program',
    'GET /api/v1/topics/:idOrSlug/rewards-program-status',
    'GET /api/v1/topics/:idOrSlug/spending-category',
    'GET /api/v1/rss-feeds',
    'GET /api/v1/rss-feeds/:id',
    'GET /api/v1/rss-feed-items',
    'GET /api/v1/rss-feed-items/:id',
    'GET /api/v1/hostnames',
    'GET /api/v1/hostnames/compare',
    'GET /api/v1/hostnames/:id',
    'GET /api/v1/trending-topics',
    'GET /api/v1/referral-link-validations',
    'GET /api/v1/referral-link-validations/:idOrSlug',
    'GET /api/v1/referral-link-validations/:validationId/rules',
    'GET /api/v1/entity-relations/:entityType/:entityId/:predicate/:objectType',
    'GET /api/v1/lists/:id',
    'GET /api/v1/lists/:id/items',
    'GET /api/v1/users',
    'GET /api/v1/users/:idOrSlug',
    'GET /api/v1/users/:idOrSlug/communities/:listType',
    'GET /api/v1/users/:idOrSlug/domains/:listType',
    'GET /api/v1/users/:idOrSlug/posts/:listType',
    'GET /api/v1/users/:idOrSlug/rss-feed-items/:listType',
    'GET /api/v1/users/:idOrSlug/rss-feeds/:listType',
    'GET /api/v1/users/:idOrSlug/topics/:listType',
    'GET /api/v1/users/:idOrSlug/urls/:listType',
    'GET /api/v1/users/:idOrSlug/users/:listType',
    'GET /api/v1/users/:username/landing-page',
    'GET /api/v1/users/:username/landing-pages/:slug',
    'GET /api/v1/communities',
    'GET /api/v1/communities/:idOrSlug',
    'GET /api/v1/communities/:idOrSlug/application-questions',
    'GET /api/v1/communities/:idOrSlug/list-items/counts',
    'GET /api/v1/communities/:idOrSlug/list-items/domains',
    'GET /api/v1/communities/:idOrSlug/list-items/posts',
    'GET /api/v1/communities/:idOrSlug/list-items/rss-feeds',
    'GET /api/v1/communities/:idOrSlug/list-items/topics',
    'GET /api/v1/communities/:idOrSlug/list-items/urls',
    'GET /api/v1/communities/:idOrSlug/members',
    'GET /api/v1/communities/:idOrSlug/news',
    'GET /api/v1/communities/:idOrSlug/pinned-posts',
    'GET /api/v1/communities/:idOrSlug/posts',
    'GET /api/v1/search',
    'GET /api/v1/web-search',
    'GET /api/v1/fediverse/search',
    'GET /api/v1/fediverse/instances',
    'GET /api/v1/fediverse/instances/:id',
    'GET /api/v1/curated-aside-items',
    'GET /api/v1/platform-stats',
    'GET /api/v1/memberships/plans',
    'GET /api/v1/countries',
    'GET /api/v1/currencies',
    'GET /api/v1/scopes',
    'GET /api/v1/localization',
    'GET /api/v1/feature-flags',
    'GET /api/v1/content-limits',
    'GET /api/v1/hacker-news-config',
    'GET /api/v1/captcha-config',
    'GET /api/v1/copyright-jurisdiction-availability',
  ],
  'sign-in, sign-out and session bootstrap, which run before a session exists': [
    'POST /api/v1/auth/email-address/tokens',
    'POST /api/v1/auth/email-address/login',
    'POST /api/v1/auth/native/email-address/tokens',
    'POST /api/v1/auth/native/email-address/login',
    'POST /api/v1/auth/passkeys/authentication/options',
    'POST /api/v1/auth/passkeys/authentication/verify',
    'POST /api/v1/auth/mfa/passkeys/authentication/options',
    'POST /api/v1/auth/mfa/passkeys/authentication/verification',
    'POST /api/v1/auth/mfa/totp/verification',
    'GET /api/v1/auth/oauth/providers',
    'POST /api/v1/auth/oauth/:provider/authorizations',
    'POST /api/v1/auth/oauth/:provider/continue',
    'GET /api/v1/auth/oauth/:provider/broker-callback',
    'GET /api/v1/auth/bluesky/callback',
    'POST /api/v1/auth/logout',
    'PATCH /api/v1/session',
    'DELETE /api/v1/session',
    'POST /api/v1/oauth/native-session-tokens',
    'POST /api/v1/app-attestation/challenge',
    'POST /api/v1/app-attestation/attest',
  ],
  'OAuth server and discovery endpoints that authenticate with client credentials or are metadata':
    [
      'GET /authorize',
      'POST /register',
      'POST /token',
      'POST /revoke',
      'GET /client-metadata.json',
      'GET /api/v1/oauth/native-clients/:app',
      'GET /.well-known/oauth-authorization-server',
      'GET /.well-known/oauth-protected-resource/api/v1/mcp',
      'GET /.well-known/oauth-protected-resource/api/v1/admin/mcp',
      'GET /.well-known/oauth-protected-resource/api/v1/brand/mcp',
      'GET /.well-known/oauth-protected-resource/api/v1/community-moderation/mcp',
      'GET /.well-known/oauth-protected-resource/api/v1/legal/mcp',
    ],
  'federation discovery documents that are public by protocol': [
    'GET /.well-known/nodeinfo',
    'GET /.well-known/webfinger',
    'GET /nodeinfo/2.0',
    'GET /ap/users/:userId',
  ],
  'anonymous write beacons and capability-token flows with no account behind them': [
    'POST /api/v1/attribution/referrer',
    'POST /api/v1/rss-feeds/:rssFeedId/views',
    'POST /api/v1/rss-feed-items/:id/views',
    'POST /api/v1/landing-pages/:landingPageId/visits',
    'POST /api/v1/landing-pages/:landingPageId/clicks',
    'POST /api/v1/email-unsubscribe',
    'POST /api/v1/copyright-notices',
    'POST /api/v1/copyright-eu-notices',
    'POST /api/v1/copyright-uk-notices',
    'POST /api/v1/copyright-notices/:id/guest-filings',
  ],
  'store webhooks that verify the provider signature instead of a session': [
    'POST /api/v1/memberships/apple-app-store/notifications',
    'POST /api/v1/memberships/google-play/notifications',
  ],
  'methods a resource answers with 405 before any handler runs': [
    'DELETE /api/v1/topics/:idOrSlug',
    'PATCH /api/v1/copyright-trusted-flaggers/:id',
    'DELETE /api/v1/copyright-trusted-flaggers/:id',
    'GET /api/v1/mcp',
    'DELETE /api/v1/mcp',
    'GET /api/v1/admin/mcp',
    'DELETE /api/v1/admin/mcp',
    'GET /api/v1/brand/mcp',
    'DELETE /api/v1/brand/mcp',
    'GET /api/v1/community-moderation/mcp',
    'DELETE /api/v1/community-moderation/mcp',
    'GET /api/v1/legal/mcp',
    'DELETE /api/v1/legal/mcp',
  ],
  'moderator route whose intake kill switch answers 503 before authentication when intake is off': [
    'POST /api/v1/copyright-email-intakes/:id/approvals',
  ],
}

const PARAM_VALUE = '019e0000-0000-7000-8000-000000000001'
const BATCH_SIZE = 25
type RouteMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

type RouteSweep = { route: string; status: number }

function listRegisteredRoutes(): string[] {
  // The router is private to the api-server package and exposes its table as `routes`.
  const router: unknown = Reflect.get(app, 'router')
  const table: unknown = router && Reflect.get(router as object, 'routes')
  if (!Array.isArray(table)) throw new Error('The API router no longer exposes its route table')
  const routes = new Set<string>()
  for (const entry of table as { method: string; path: string }[]) {
    if (entry.method === 'HEAD' || isTestRegisteredRoute(entry.method, entry.path)) continue
    routes.add(`${entry.method} ${entry.path}`)
  }
  return [...routes].toSorted()
}

function sendAnonymously(route: string) {
  const [method, template] = route.split(' ') as [RouteMethod, string]
  const url = template.replaceAll(/:[A-Za-z0-9_]+/g, PARAM_VALUE).replaceAll('*', 'x')
  const agent = createRequest()
  switch (method) {
    case 'GET':
      return agent.get(url)
    case 'DELETE':
      return agent.delete(url)
    case 'POST':
      return agent.post(url).send({})
    case 'PUT':
      return agent.put(url).send({})
    case 'PATCH':
      return agent.patch(url).send({})
    default:
      throw new Error(`Unhandled route method: ${route}`)
  }
}

describe('route authentication', () => {
  const routes = listRegisteredRoutes()
  const publicRoutes = new Set(Object.values(PUBLIC_ROUTES).flat())
  const statuses = new Map<string, number>()

  beforeAll(async () => {
    for (let start = 0; start < routes.length; start += BATCH_SIZE) {
      const batch = routes.slice(start, start + BATCH_SIZE)
      const results = await Promise.all(
        batch.map(async (route): Promise<RouteSweep> => ({
          route,
          status: (await sendAnonymously(route)).status,
        })),
      )
      for (const { route, status } of results) statuses.set(route, status)
    }
  })

  // On failure: add authentication to the route, or declare it in PUBLIC_ROUTES with the reason an
  // anonymous caller may reach it.
  it('answers 401 to an anonymous request on every route not declared public', () => {
    const reachable = routes
      .filter(route => !publicRoutes.has(route) && statuses.get(route) !== 401)
      .map(route => `${route} answered ${statuses.get(route)}`)
    expect(reachable).toEqual([])
  })

  it('declares only registered routes as public', () => {
    const registered = new Set(routes)
    expect([...publicRoutes].filter(route => !registered.has(route))).toEqual([])
  })

  // On failure: the route now authenticates, so remove it from PUBLIC_ROUTES.
  it('does not declare a route public once it answers an anonymous request with 401', () => {
    const stale = [...publicRoutes].filter(route => statuses.get(route) === 401)
    expect(stale).toEqual([])
  })
})
