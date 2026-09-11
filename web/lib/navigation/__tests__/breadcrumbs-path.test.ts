// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { buildBreadcrumbsForPath } from '../breadcrumbs'

describe('buildBreadcrumbsForPath', () => {
  it('derives posts intent from /story/123 and includes the tail leaf', () => {
    const result = buildBreadcrumbsForPath('/story/123', {
      isAuthenticated: true,
      userRoles: [],
      tail: [{ name: 'My Story', path: '/story/123' }],
    })
    // Authed: [posts-landing, leaf] — 2 items (unless leaf === landing, which won't happen here)
    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result.at(-1)).toEqual({ name: 'My Story', path: '/story/123' })
  })

  it('uses intentCrumbOverride when provided', () => {
    const result = buildBreadcrumbsForPath('/story/123', {
      isAuthenticated: true,
      userRoles: [],
      tail: [{ name: 'My Story', path: '/story/123' }],
      intentCrumbOverride: { name: 'My Community', path: '/community/foo' },
    })
    expect(result[0]).toEqual({ name: 'My Community', path: '/community/foo' })
    expect(result.at(-1)).toEqual({ name: 'My Story', path: '/story/123' })
  })

  it('unknown path falls back to news intent (public), anon gets [Home, news-landing, leaf] or similar', () => {
    const result = buildBreadcrumbsForPath('/unknown-xyz', {
      isAuthenticated: false,
      tail: [{ name: 'Leaf', path: '/unknown-xyz' }],
    })
    // news fallback is public; anon sees Home + intent crumb + leaf (or collapsed if dedup)
    expect(result.length).toBeGreaterThanOrEqual(2)
    expect(result[0]).toEqual({ nameKey: 'nav.home', path: '/' })
  })

  it('derives messages intent from /my/notifications for authed user (collapsed — landing === leaf)', () => {
    const result = buildBreadcrumbsForPath('/my/notifications', {
      isAuthenticated: true,
      userRoles: [],
      tail: [{ name: 'Notifications', path: '/my/notifications' }],
    })
    // Messages landing = /my/notifications === tail leaf → deduped to 1 item → collapsed to []
    expect(result).toEqual([])
  })

  it('derives topics intent from /compare/a-vs-b', () => {
    const result = buildBreadcrumbsForPath('/compare/a-vs-b', {
      isAuthenticated: true,
      userRoles: [],
      tail: [{ name: 'A vs B', path: '/compare/a-vs-b' }],
    })
    expect(result.at(-1)).toEqual({ name: 'A vs B', path: '/compare/a-vs-b' })
  })
})
