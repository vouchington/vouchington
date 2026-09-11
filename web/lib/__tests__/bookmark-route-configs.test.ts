import { describe, expect, it } from 'vitest'
import type { MessageKey } from '@ts-shared/ui-messages'
import { NAV_INTENTS } from '@/lib/navigation/intents'
import { bookmarkRouteConfigs, getBookmarkCrossLinks } from '@/lib/bookmark-route-configs'

// This suite checks structural parity of the config data, not translated output, so an
// identity translator is sufficient — it avoids depending on the message catalog.
const identityT = (key: MessageKey): string => key

describe('bookmarkRouteConfigs parity', () => {
  it('all paths start with /my/', () => {
    for (const [, config] of Object.entries(bookmarkRouteConfigs)) {
      expect(config.path).toMatch(/^\/my\//)
    }
  })

  it('every entry has a valid family or explicit null singleton', () => {
    const validFamilies = new Set([
      'saved',
      'hidden',
      'viewed-items',
      'viewed-sources',
      'following',
      'muted',
      'blocked',
      'subscribed',
      'import-export',
      null,
    ])
    for (const [, config] of Object.entries(bookmarkRouteConfigs)) {
      expect(validFamilies.has(config.family)).toBe(true)
    }
  })

  it('every family with ≥2 members produces a dropdown', () => {
    const familyCounts = new Map<string, number>()
    for (const config of Object.values(bookmarkRouteConfigs)) {
      if (!config.family) continue
      familyCounts.set(config.family, (familyCounts.get(config.family) ?? 0) + 1)
    }
    for (const [family, count] of familyCounts) {
      if (count < 2) continue
      // Sample the first member of this family
      const member = Object.values(bookmarkRouteConfigs).find(c => c.family === family)!
      const links = getBookmarkCrossLinks(identityT, member.family, member.path)
      expect(links.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('every /my/* nav item href has a corresponding bookmarkRouteConfigs entry', () => {
    // Non-bookmark /my/* pages that legitimately appear in the nav sidebar but
    // do not belong in bookmarkRouteConfigs (they are not relation/list pages).
    const NON_BOOKMARK_MY_PATHS = new Set([
      '/my/notifications', // notification inbox (messages intent)
      '/my/appeals', // user's own moderation appeals (moderation intent)
      '/my/disputes', // user's own moderation disputes (moderation intent)
      '/my/friend-recommendations', // find-friends page (friends intent)
      '/my/lists', // lists management page (lists intent) — not a bookmark relation page
    ])
    const registryPaths = new Set(Object.values(bookmarkRouteConfigs).map(c => c.path))
    const missing: string[] = []
    for (const intent of NAV_INTENTS) {
      for (const group of intent.groups) {
        for (const item of group.items) {
          if (!item.requiresAuth) continue
          if (!item.href.startsWith('/my/')) continue
          if (NON_BOOKMARK_MY_PATHS.has(item.href)) continue
          if (!registryPaths.has(item.href)) {
            missing.push(`${item.href} (${item.label})`)
          }
        }
      }
    }
    expect(missing).toEqual([])
  })

  it('routeKey paths match their keys', () => {
    for (const [key, config] of Object.entries(bookmarkRouteConfigs)) {
      expect(config.path).toBe(`/my/${key}`)
    }
  })

  it('getBookmarkCrossLinks returns empty for null family', () => {
    const links = getBookmarkCrossLinks(identityT, null, '/my/users/followers')
    expect(links).toEqual([])
  })

  it('active item is marked in cross-links', () => {
    const links = getBookmarkCrossLinks(identityT, 'saved', '/my/news-items/saved')
    const active = links.filter(l => l.active)
    expect(active).toHaveLength(1)
    expect(active[0]?.href).toBe('/my/news-items/saved')
  })

  it('singleton configs (family null) do not self-reference in breadcrumbs', () => {
    for (const [, config] of Object.entries(bookmarkRouteConfigs)) {
      if (config.family !== null) continue
      expect(config.breadcrumb.path).not.toBe(config.path)
    }
  })
})
