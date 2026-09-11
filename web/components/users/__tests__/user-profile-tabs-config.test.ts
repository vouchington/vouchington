// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  getActiveTopLevelTab,
  getTopLevelTabHref,
  getVisibleTopLevelTabs,
  TOP_LEVEL_TABS,
} from '../user-profile-tabs-config'

describe('getTopLevelTabHref', () => {
  it('returns the index route for the about tab', () => {
    const tab = TOP_LEVEL_TABS.find(t => t.name === 'about')!
    expect(getTopLevelTabHref(tab, 'alice')).toBe('/user/alice')
  })

  it('returns /posts for the posts tab', () => {
    const tab = TOP_LEVEL_TABS.find(t => t.name === 'posts')!
    expect(getTopLevelTabHref(tab, 'alice')).toBe('/user/alice/posts')
  })

  it('returns /topics/following for the topics tab', () => {
    const tab = TOP_LEVEL_TABS.find(t => t.name === 'topics')!
    expect(getTopLevelTabHref(tab, 'alice')).toBe('/user/alice/topics/following')
  })

  it('returns /users/following for the friends tab', () => {
    const tab = TOP_LEVEL_TABS.find(t => t.name === 'friends')!
    expect(getTopLevelTabHref(tab, 'alice')).toBe('/user/alice/users/following')
  })

  it('returns /rss-feeds/following for the sources tab', () => {
    const tab = TOP_LEVEL_TABS.find(t => t.name === 'sources')!
    expect(getTopLevelTabHref(tab, 'alice')).toBe('/user/alice/rss-feeds/following')
  })

  it('returns /communities/member for the communities tab', () => {
    const tab = TOP_LEVEL_TABS.find(t => t.name === 'communities')!
    expect(getTopLevelTabHref(tab, 'alice')).toBe('/user/alice/communities/member')
  })
})

describe('getActiveTopLevelTab', () => {
  it.each([
    ['/user/alice', 'alice', 'about'],
    ['/user/alice/posts', 'alice', 'posts'],
    ['/user/alice/reviews', 'alice', 'posts'],
    ['/user/alice/discussions', 'alice', 'posts'],
    ['/user/alice/comments', 'alice', 'posts'],
    ['/user/alice/topics/following', 'alice', 'topics'],
    ['/user/alice/users/following', 'alice', 'friends'],
    ['/user/alice/users/followers', 'alice', 'friends'],
    ['/user/alice/rss-feeds/following', 'alice', 'sources'],
    ['/user/alice/communities/member', 'alice', 'communities'],
  ] as const)('%s → %s', (pathname, id, expected) => {
    expect(getActiveTopLevelTab(pathname, id)).toBe(expected)
  })

  it('does NOT match about when on a sub-route (exactMatch)', () => {
    expect(getActiveTopLevelTab('/user/alice/reviews', 'alice')).not.toBe('about')
  })

  it('defaults to about for unknown routes', () => {
    expect(getActiveTopLevelTab('/user/alice/unknown-section', 'alice')).toBe('about')
  })
})

describe('getVisibleTopLevelTabs', () => {
  it('returns all 6 public tabs', () => {
    const tabNames = getVisibleTopLevelTabs().map(t => t.name)
    expect(tabNames).toEqual(['about', 'posts', 'topics', 'friends', 'sources', 'communities'])
  })
})
