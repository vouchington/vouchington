import { beforeAll, describe, expect, it } from 'vitest'
import { createTranslator } from '@ts-shared/ui-messages'
import { enMessages } from '@ts-shared/ui-messages/locale-catalogs'
import {
  EMPTY_RESULTS,
  getMatchingShortcuts,
  getSearchTabs,
  type Translator,
} from './command-search-data'
import { DERIVED_PAGE_SHORTCUTS } from '@/lib/navigation/derive-page-shortcuts'

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

describe('getSearchTabs', () => {
  let t: Translator

  beforeAll(async () => {
    t = createTranslator('en', enMessages)
  })

  it('contains Communities after Topics when the full tab list is enabled', () => {
    const tabValues = getSearchTabs({ fediverse: true }).map(tab => tab.value)
    const topicsIdx = tabValues.indexOf('topics')
    const communitiesIdx = tabValues.indexOf('communities')
    expect(communitiesIdx).toBe(topicsIdx + 1)
  })

  it('has Communities tab with the expected label', () => {
    const communitiesTab = getSearchTabs({ fediverse: true }).find(
      tab => tab.value === 'communities',
    )
    expect(communitiesTab).toBeDefined()
    expect(t(communitiesTab!.label)).toBe('Communities')
  })

  it('omits Fediverse when its feature flag is disabled', () => {
    expect(getSearchTabs({ fediverse: false }).some(tab => tab.value === 'fediverse')).toBe(false)
  })
})

describe('EMPTY_RESULTS', () => {
  it('has communities array', () => {
    expect(EMPTY_RESULTS.communities).toEqual([])
  })
})
