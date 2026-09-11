import { describe, it, expect } from 'vitest'
import { tabGroups, isSettingsRoute } from '../settings-routes'

// Derive all known settings hrefs from the source-of-truth tabGroups so this
// test stays in sync automatically when routes are added or removed.
const allSettingsHrefs = tabGroups.flatMap(g => g.items.map(i => i.href))

describe('isSettingsRoute', () => {
  it.each(allSettingsHrefs)('returns true for settings route %s', pathname => {
    expect(isSettingsRoute(pathname)).toBe(true)
  })

  it.each([
    '/my/notifications',
    '/my/friend-recommendations',
    '/my/referrals',
    '/my/bookmarks',
    '/',
    '/news',
  ])('returns false for non-settings route %s', pathname => {
    expect(isSettingsRoute(pathname)).toBe(false)
  })
})
