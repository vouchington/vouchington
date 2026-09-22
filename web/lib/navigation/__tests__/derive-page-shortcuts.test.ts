import { beforeAll, describe, expect, it } from 'vitest'
import { createTranslator } from '@ts-shared/ui-messages'
import { NAV_INTENTS } from '../intents'
import { DERIVED_PAGE_SHORTCUTS, hrefToDataPw } from '../derive-page-shortcuts'
import { enMessages } from '@ts-shared/ui-messages/locale-catalogs'

describe('DERIVED_PAGE_SHORTCUTS parity', () => {
  let t: ReturnType<typeof createTranslator>

  beforeAll(async () => {
    t = createTranslator('en', enMessages)
  })

  it('includes every non-comingSoon, deduped NAV_INTENTS href', () => {
    const seen = new Set<string>()
    const intentHrefs: string[] = []
    for (const intent of NAV_INTENTS) {
      for (const group of intent.groups) {
        for (const item of group.items) {
          if (item.comingSoon) continue
          if (seen.has(item.href)) continue
          seen.add(item.href)
          intentHrefs.push(item.href)
        }
      }
    }
    const derivedHrefs = new Set(DERIVED_PAGE_SHORTCUTS.map(s => s.href))
    for (const href of intentHrefs) {
      expect(derivedHrefs).toContain(href)
    }
  })

  it('excludes comingSoon items', () => {
    const allItems = NAV_INTENTS.flatMap(i => i.groups.flatMap(g => g.items))
    const comingSoonHrefs = new Set(allItems.filter(i => i.comingSoon).map(i => i.href))
    const nonComingSoonHrefs = new Set(allItems.filter(i => !i.comingSoon).map(i => i.href))
    const derivedHrefs = new Set(DERIVED_PAGE_SHORTCUTS.map(s => s.href))
    // Pre-filter to hrefs with no non-comingSoon counterpart; then assert unconditionally.
    const purelyComingSoonHrefs = [...comingSoonHrefs].filter(href => !nonComingSoonHrefs.has(href))
    for (const href of purelyComingSoonHrefs) {
      expect(derivedHrefs).not.toContain(href)
    }
  })

  it('assigns correct buckets for key pages', () => {
    function bucket(href: string) {
      return DERIVED_PAGE_SHORTCUTS.find(s => s.href === href)?.bucket
    }
    expect(bucket('/urls')).toBe('authenticated')
    expect(bucket('/topic-recommendations')).toBe('authenticated')
    expect(bucket('/news')).toBe('public')
    expect(bucket('/reports')).toBe('admin')
    expect(bucket('/sources')).toBe('public')
    expect(bucket('/communities')).toBe('public')
    expect(bucket('/users')).toBe('authenticated')
    expect(bucket('/my/friend-recommendations')).toBe('authenticated')
    expect(bucket('/my/topics/dismissed-recommendations')).toBe('authenticated')
  })

  it('sidebar link label is Recommend New Topics', () => {
    const shortcut = DERIVED_PAGE_SHORTCUTS.find(s => s.href === '/topic-recommendations')
    expect(shortcut && t(shortcut.label)).toBe('Recommend New Topics')
  })

  it('derives dataPw from href correctly', () => {
    expect(hrefToDataPw('/urls')).toBe('search-page-shortcut-urls')
    expect(hrefToDataPw('/posts/review-queue')).toBe('search-page-shortcut-posts-review-queue')
    expect(hrefToDataPw('/memberships/grants')).toBe('search-page-shortcut-memberships-grants')
    expect(hrefToDataPw('/vote-integrity/flags')).toBe('search-page-shortcut-vote-integrity-flags')
    expect(hrefToDataPw('/vote-integrity/penalties')).toBe(
      'search-page-shortcut-vote-integrity-penalties',
    )

    // Literal expected dataPw per href, independent of hrefToDataPw, so a regression in the
    // helper's transform (not just its use) is caught rather than re-validated against itself.
    const expectedDataPwByHref: Record<string, string> = {
      '/urls': 'search-page-shortcut-urls',
      '/topic-recommendations': 'search-page-shortcut-topic-recommendations',
      '/news': 'search-page-shortcut-news',
      '/reports': 'search-page-shortcut-reports',
      '/sources': 'search-page-shortcut-sources',
      '/communities': 'search-page-shortcut-communities',
      '/users': 'search-page-shortcut-users',
      '/my/friend-recommendations': 'search-page-shortcut-my-friend-recommendations',
      '/plans': 'search-page-shortcut-plans',
      '/article/keyboard-shortcuts': 'search-page-shortcut-article-keyboard-shortcuts',
      '/report-integrity/penalties': 'search-page-shortcut-report-integrity-penalties',
      '/vote-integrity/penalties': 'search-page-shortcut-vote-integrity-penalties',
    }

    for (const [href, expectedDataPw] of Object.entries(expectedDataPwByHref)) {
      const shortcut = DERIVED_PAGE_SHORTCUTS.find(s => s.href === href)
      expect(shortcut?.dataPw).toBe(expectedDataPw)
    }

    for (const s of DERIVED_PAGE_SHORTCUTS) {
      expect(s.dataPw).toMatch(/^search-page-shortcut-/)
    }
  })

  it('includes both integrity penalty ledgers as admin shortcuts', () => {
    const adminHrefs = DERIVED_PAGE_SHORTCUTS.filter(s => s.bucket === 'admin').map(s => s.href)
    expect(adminHrefs).toContain('/report-integrity/penalties')
    expect(adminHrefs).toContain('/vote-integrity/penalties')
  })

  it('has unique hrefs (no duplicate keys)', () => {
    const hrefs = DERIVED_PAGE_SHORTCUTS.map(s => s.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it('includes supplemental pages in public bucket', () => {
    const publicHrefs = DERIVED_PAGE_SHORTCUTS.filter(s => s.bucket === 'public').map(s => s.href)
    expect(publicHrefs).toContain('/plans')
    expect(publicHrefs).toContain('/article/keyboard-shortcuts')
  })
})
