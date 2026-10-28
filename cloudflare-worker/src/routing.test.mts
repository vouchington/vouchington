import { describe, expect, it } from 'vitest'
import {
  API_ROUTE_RE,
  RSS_ROUTE_RE,
  getOriginPathOverride,
  getRouteTarget,
  isAdminBackendRoute,
  isOAuthAuthorizationServerRoute,
} from './routing.mts'

describe('routing', () => {
  it('routes sitemap paths to sitemaps origin and api paths to backend', () => {
    expect(getRouteTarget('/sitemap.xml')).toBe('sitemaps')
    expect(getRouteTarget('/sitemaps/discussion/2026-03-04/index.xml')).toBe('sitemaps')
    expect(getRouteTarget('/api')).toBe('backend')
    expect(getRouteTarget('/api/v1/posts')).toBe('backend')
  })

  it('routes exact OAuth authorization-server paths to backend', () => {
    for (const pathname of ['/authorize', '/register', '/revoke', '/token']) {
      expect(isOAuthAuthorizationServerRoute(pathname)).toBe(true)
      expect(getRouteTarget(pathname)).toBe('backend')
    }
    for (const pathname of ['/authorize/help', '/registered', '/tokenized', '/oauth/consent']) {
      expect(isOAuthAuthorizationServerRoute(pathname)).toBe(false)
      expect(getRouteTarget(pathname)).toBe('web')
    }
  })

  it.each(['facebook', 'x', 'github', 'google', 'linkedin', 'microsoft'])(
    'routes the %s OAuth broker callback to its canonical backend path',
    provider => {
      const pathname = `/auth/callback/${provider}/broker`
      expect(getRouteTarget(pathname)).toBe('backend')
      expect(getOriginPathOverride(pathname)).toBe(`/api/v1/auth/oauth/${provider}/broker-callback`)
    },
  )

  it('keeps Basic Auth path normalization aligned with OAuth broker routing', () => {
    expect(getRouteTarget('/AUTH/CALLBACK/GITHUB/BROKER/')).toBe('backend')
    expect(getOriginPathOverride('/AUTH/CALLBACK/GITHUB/BROKER/')).toBe(
      '/api/v1/auth/oauth/github/broker-callback',
    )
  })

  it.each([
    '/auth/callback/github/brokered',
    '/auth/callback/github/broker/extra',
    '/auth/callback/github',
    '/auth/callback/google/brokered',
  ])('keeps OAuth broker callback near miss %s on the web origin', pathname => {
    expect(getRouteTarget(pathname)).toBe('web')
    expect(getOriginPathOverride(pathname)).toBeNull()
  })

  it('treats API route prefixes case-insensitively', () => {
    expect(API_ROUTE_RE.test('/API')).toBe(true)
    expect(API_ROUTE_RE.test('/API/v1/posts')).toBe(true)
    expect(getRouteTarget('/API/v1/posts')).toBe('backend')
    expect(API_ROUTE_RE.test('/apix')).toBe(false)
  })

  it('routes infra paths to backend case-insensitively', () => {
    expect(getRouteTarget('/infra/ping')).toBe('backend')
    expect(getRouteTarget('/INFRA/ping')).toBe('backend')
    expect(getRouteTarget('/infra/health')).toBe('backend')
    expect(getRouteTarget('/infrastructure')).toBe('web')
  })

  it('routes /images/* to web (DNS for images-<env>.voucha.ai points directly at CloudFront; web frontend mints absolute URLs so the worker never sees these paths in production)', () => {
    expect(getRouteTarget('/images')).toBe('web')
    expect(getRouteTarget('/images/abc.jpg')).toBe('web')
    expect(getRouteTarget('/images/photos/cat.png')).toBe('web')
  })

  it('falls /sideload/* through to web after absolute image URLs replace the apex shim', () => {
    expect(getRouteTarget('/sideload')).toBe('web')
    expect(getRouteTarget('/sideload/aHR0cHM6Ly9leGFtcGxlLmNvbQ')).toBe('web')
  })

  it('routes /md/* paths to backend', () => {
    expect(getRouteTarget('/md')).toBe('backend')
    expect(getRouteTarget('/md/posts')).toBe('backend')
    expect(getRouteTarget('/MD/posts')).toBe('backend')
    expect(getRouteTarget('/md/posts/my-post')).toBe('backend')
    expect(getRouteTarget('/md/topics')).toBe('backend')
    expect(getRouteTarget('/md/users/johndoe')).toBe('backend')
  })

  it('routes markdown aliases to backend', () => {
    expect(getRouteTarget('/review/amex-gold.md')).toBe('backend')
    expect(getRouteTarget('/topic/credit-cards.md')).toBe('backend')
    expect(getRouteTarget('/user/jong.md')).toBe('backend')
  })

  it('adds type constraints to typed markdown aliases', () => {
    expect(getOriginPathOverride('/review/amex-gold.md')).toBe(
      '/md/posts/amex-gold?post_types=review',
    )
    expect(getOriginPathOverride('/blog-post/my-post.md')).toBe(
      '/md/posts/my-post?post_types=blog_post',
    )
    expect(getOriginPathOverride('/card/amex-gold.md')).toBe(
      '/md/topics/amex-gold?topic_types=card',
    )
    expect(getOriginPathOverride('/rewards-program/chase-ultimate-rewards.md')).toBe(
      '/md/topics/chase-ultimate-rewards?topic_types=rewards_program',
    )
  })

  it('does not treat hostname detail pages as markdown topic aliases', () => {
    expect(getRouteTarget('/domain/example.com.md')).toBe('web')
  })

  it('rejects dot-segment markdown alias ids', () => {
    expect(getRouteTarget('/review/..md')).toBe('web')
    expect(getRouteTarget('/topic/..md')).toBe('web')
    expect(getRouteTarget('/user/..md')).toBe('web')
    expect(getRouteTarget('/review/.md')).toBe('web')
  })

  it('routes /admin/mq-dashboard to backend', () => {
    expect(getRouteTarget('/admin/mq-dashboard')).toBe('backend')
    expect(getRouteTarget('/admin/mq-dashboard/queues')).toBe('backend')
  })

  it('routes all other paths to web', () => {
    expect(getRouteTarget('/')).toBe('web')
    expect(getRouteTarget('/about')).toBe('web')
    expect(getRouteTarget('/t/gtm.js')).toBe('web')
    expect(getRouteTarget('/blog/my-post')).toBe('web')
    expect(getRouteTarget('/admin')).toBe('web')
    expect(getRouteTarget('/admin/components/shell')).toBe('web')
  })

  it('routes markdown prefix near misses to web', () => {
    expect(getRouteTarget('/mdx')).toBe('web')
    expect(getRouteTarget('/admin')).toBe('web')
    expect(getRouteTarget('/about')).toBe('web')
  })

  it('routes RSS paths to backend', () => {
    expect(getRouteTarget('/rss')).toBe('backend')
    expect(getRouteTarget('/rss/posts')).toBe('backend')
    expect(getRouteTarget('/RSS/posts')).toBe('backend')
    expect(getRouteTarget('/rss/news')).toBe('backend')
  })

  it('identifies RSS routes', () => {
    expect(RSS_ROUTE_RE.test('/rss')).toBe(true)
    expect(RSS_ROUTE_RE.test('/rss/')).toBe(true)
    expect(RSS_ROUTE_RE.test('/RSS/posts')).toBe(true)
    expect(RSS_ROUTE_RE.test('/rss/posts')).toBe(true)
    expect(RSS_ROUTE_RE.test('/rss/news')).toBe(true)
    expect(RSS_ROUTE_RE.test('/rss-something')).toBe(false)
    expect(RSS_ROUTE_RE.test('/api/rss')).toBe(false)
  })

  it('routes ActivityPub federation paths (/.well-known/, /ap/, /nodeinfo/) to backend (Phase C5)', () => {
    expect(getRouteTarget('/.well-known/webfinger')).toBe('backend')
    expect(getRouteTarget('/.well-known/nodeinfo')).toBe('backend')
    expect(getRouteTarget('/nodeinfo/2.0')).toBe('backend')
    expect(getRouteTarget('/ap/users/abc-123')).toBe('backend')
    expect(getRouteTarget('/ap/inbox')).toBe('backend')
  })

  it('routes the worker-owned static /.well-known/* documents to backend at the routing layer too (Phase C5) — inline-responses.mts intercepts these before getRouteTarget runs, so this broad prefix never actually overrides their static serving', () => {
    expect(getRouteTarget('/.well-known/security.txt')).toBe('backend')
    expect(getRouteTarget('/.well-known/api-catalog')).toBe('backend')
    expect(getRouteTarget('/.well-known/traffic-advice')).toBe('backend')
    expect(getRouteTarget('/.well-known/agent-card.json')).toBe('backend')
    expect(getRouteTarget('/.well-known/agent-skills.json')).toBe('backend')
  })

  it('routes well-known prefix near misses to web', () => {
    expect(getRouteTarget('/.well-known')).toBe('backend')
    expect(getRouteTarget('/.well-known/')).toBe('backend')
    expect(getRouteTarget('/.WELL-KNOWN/webfinger')).toBe('backend')
    expect(getRouteTarget('/well-known/webfinger')).toBe('web')
    expect(getRouteTarget('/.well-knownx')).toBe('web')
  })

  it('routes AP prefix near misses to web', () => {
    expect(getRouteTarget('/ap')).toBe('backend')
    expect(getRouteTarget('/ap/')).toBe('backend')
    expect(getRouteTarget('/AP/inbox')).toBe('backend')
    expect(getRouteTarget('/ap/users/abc')).toBe('backend')
    expect(getRouteTarget('/apple')).toBe('web')
  })

  it('routes nodeinfo prefix near misses to web', () => {
    expect(getRouteTarget('/nodeinfo')).toBe('backend')
    expect(getRouteTarget('/nodeinfo/2.0')).toBe('backend')
    expect(getRouteTarget('/NODEINFO/2.0')).toBe('backend')
    expect(getRouteTarget('/nodeinformation')).toBe('web')
  })

  it('routes the Bluesky AT-Protocol client-metadata document to backend (Phase D1)', () => {
    expect(getRouteTarget('/client-metadata.json')).toBe('backend')
    expect(getRouteTarget('/CLIENT-METADATA.JSON')).toBe('backend')
  })

  it('routes only the exact client-metadata path outside the API prefix', () => {
    expect(getRouteTarget('/client-metadata.json')).toBe('backend')
    expect(getRouteTarget('/CLIENT-METADATA.JSON')).toBe('backend')
    expect(getRouteTarget('/client-metadata.json/extra')).toBe('web')
  })

  it('identifies admin backend routes', () => {
    expect(isAdminBackendRoute('/admin/mq-dashboard')).toBe(true)
    expect(isAdminBackendRoute('/admin/mq-dashboard/')).toBe(true)
    expect(isAdminBackendRoute('/admin/mq-dashboard/queues')).toBe(true)
    expect(isAdminBackendRoute('/admin')).toBe(false)
    expect(isAdminBackendRoute('/admin/components/shell')).toBe(false)
    expect(isAdminBackendRoute('/about')).toBe(false)
    expect(isAdminBackendRoute('/administrator')).toBe(false)
  })
})
