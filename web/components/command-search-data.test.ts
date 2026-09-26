import { beforeAll, describe, expect, it } from 'vitest'
import { createTranslator } from '@ts-shared/ui-messages'
import { enMessages } from '@ts-shared/ui-messages/locale-catalogs'
import {
  EMPTY_RESULTS,
  SEARCH_TABS,
  getMatchingShortcuts,
  type Translator,
} from './command-search-data'
import { DERIVED_PAGE_SHORTCUTS } from '@/lib/navigation/derive-page-shortcuts'
import { sortByBookmarked } from './command-search-data-search'

describe('getMatchingShortcuts', () => {
  let t: Translator

  beforeAll(async () => {
    t = createTranslator('en', enMessages)
  })

  it('returns empty array for blank query', () => {
    expect(getMatchingShortcuts(t, '', false)).toEqual([])
  })

  it('returns matching public shortcuts for unauthenticated user', () => {
    const results = getMatchingShortcuts(t, 'news', false)
    expect(results.some(s => s.href === '/news')).toBe(true)
  })

  it('limits results to 5', () => {
    const results = getMatchingShortcuts(t, 'a', true, true)
    expect(results.length).toBeLessThanOrEqual(5)
  })

  it('returns entity-scoped admin shortcuts for administrators', () => {
    expect(getMatchingShortcuts(t, 'create topic', true)).toContainEqual(
      expect.objectContaining({
        href: '/topics/create',
      }),
    )
    expect(getMatchingShortcuts(t, 'topic aliases', true)).toContainEqual(
      expect.objectContaining({
        href: '/topics/aliases',
      }),
    )
    const recommendResults = getMatchingShortcuts(t, 'recommendations', true, true)
    expect(recommendResults).toContainEqual(
      expect.objectContaining({
        href: '/topic-recommendations',
      }),
    )
    expect(recommendResults.some(s => t(s.label) === 'Recommend New Topics')).toBe(true)
  })

  it('keeps admin shortcut hrefs on canonical routes', () => {
    const migratedTopicAdminPrefix = '/admin/topics'
    const derivedHrefs = DERIVED_PAGE_SHORTCUTS.map(s => s.href)
    expect(derivedHrefs).toContain('/urls')
    expect(derivedHrefs).toContain('/users')
    expect(derivedHrefs).toContain('/admin/moderation-analytics')
    expect(derivedHrefs).toContain('/admin/oauth-clients')
    expect(derivedHrefs).toContain('/curated-asides/topics')
    expect(derivedHrefs).toContain('/rss-feed-categories')
    expect(derivedHrefs).toContain('/admin/queues')
    expect(derivedHrefs).not.toContain(`${migratedTopicAdminPrefix}/create`)
    expect(derivedHrefs).not.toContain(`${migratedTopicAdminPrefix}/aliases`)
  })

  it('keeps public post and community shortcut hrefs on canonical routes', () => {
    const publicHrefs = DERIVED_PAGE_SHORTCUTS.filter(s => s.bucket === 'public').map(s => s.href)
    expect(publicHrefs).toContain('/posts')
    expect(publicHrefs).toContain('/communities')
  })

  it('assigns stable data-pw values to every page shortcut', () => {
    expect(DERIVED_PAGE_SHORTCUTS.every(s => s.dataPw.startsWith('search-page-shortcut-'))).toBe(
      true,
    )
    expect(DERIVED_PAGE_SHORTCUTS.find(s => s.href === '/urls')?.dataPw).toBe(
      'search-page-shortcut-urls',
    )
  })
})

describe('SEARCH_TABS', () => {
  let t: Translator

  beforeAll(async () => {
    t = createTranslator('en', enMessages)
  })

  it('contains Communities tab after Topics', () => {
    const tabValues = SEARCH_TABS.map(tab => tab.value)
    const topicsIdx = tabValues.indexOf('topics')
    const communitiesIdx = tabValues.indexOf('communities')
    expect(communitiesIdx).toBe(topicsIdx + 1)
  })

  it('has Communities tab with correct label', () => {
    const communitiesTab = SEARCH_TABS.find(tab => tab.value === 'communities')
    expect(communitiesTab).toBeDefined()
    expect(t(communitiesTab!.label)).toBe('Communities')
  })
})

describe('EMPTY_RESULTS', () => {
  it('has communities array', () => {
    expect(EMPTY_RESULTS.communities).toEqual([])
  })
})

describe('sortByBookmarked', () => {
  const items = [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
    { id: 'c', name: 'C' },
  ]

  it('returns items unchanged when no bookmarks provided', () => {
    expect(sortByBookmarked(items)).toEqual(items)
  })

  it('returns items unchanged when bookmarks is empty', () => {
    expect(sortByBookmarked(items, {})).toEqual(items)
  })

  it('boosts followed items to the top', () => {
    const bookmarks = { b: { follow: true } }
    const result = sortByBookmarked(items, bookmarks)
    expect(result[0]?.id).toBe('b')
  })

  it('boosts saved items to the top', () => {
    const bookmarks = { c: { save: true } }
    const result = sortByBookmarked(items, bookmarks)
    expect(result[0]?.id).toBe('c')
  })

  it('boosts proxy_followed items to the top', () => {
    const bookmarks = { a: { proxy_follow: true } }
    const result = sortByBookmarked(items, bookmarks)
    expect(result[0]?.id).toBe('a')
  })

  it('does not boost muted items', () => {
    const bookmarks = { b: { mute: true } }
    const result = sortByBookmarked(items, bookmarks)
    expect(result[0]?.id).toBe('a')
  })

  it('does not boost items with only negative predicates', () => {
    const bookmarks = { b: { mute: true, block: true, hide: true } }
    const result = sortByBookmarked(items, bookmarks)
    expect(result[0]?.id).toBe('a')
  })

  it('preserves relative order of non-bookmarked items', () => {
    const bookmarks = { c: { follow: true } }
    const result = sortByBookmarked(items, bookmarks)
    expect(result.map(r => r.id)).toEqual(['c', 'a', 'b'])
  })
})
