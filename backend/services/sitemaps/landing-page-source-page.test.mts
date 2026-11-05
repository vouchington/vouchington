import { describe, expect, it } from 'vitest'
import {
  createTestLandingPage,
  createTestLandingPageLinkItem,
  createTestUser,
  softDeleteUser,
} from '@voucha/test-helpers'
import { readLandingSitemapSourcePage } from './family-queries.mts'

describe('landing page sitemap source pages', () => {
  it('continues past a deleted owner without skipping the next live page', async () => {
    const liveBefore = await createTestUser()
    const deleted = await createTestUser()
    const liveAfter = await createTestUser()
    const pages: Array<Awaited<ReturnType<typeof createTestLandingPage>>> = []
    for (const user of [liveBefore, deleted, liveAfter]) {
      const page = await createTestLandingPage(user.id, `owner-${user.id}`)
      await createTestLandingPageLinkItem(
        page.landingPageId,
        'Link',
        `https://example.com/${page.slug}`,
      )
      pages.push(page)
    }
    await softDeleteUser(deleted.id)
    const owned = new Set(pages.map(page => page.landingPageId))
    const highWaterId = pages[2]!.landingPageId

    const seen: string[] = []
    let afterId: string | undefined
    let emptyContinuation = false
    for (let step = 0; step < 8; step++) {
      const page = await readLandingSitemapSourcePage({
        highWaterId,
        limit: 2,
        ...(afterId ? { afterId } : {}),
      })
      seen.push(...page.entries.flatMap(entry => (owned.has(entry.id) ? [entry.id] : [])))
      if (page.entries.length === 0 && !page.exhausted) emptyContinuation = true
      if (page.exhausted || !page.afterId || page.afterId <= pages[0]!.landingPageId) {
        if (page.entries.some(entry => entry.id === pages[0]!.landingPageId)) break
        if (page.exhausted || (page.afterId && page.afterId < pages[0]!.landingPageId)) break
      }
      afterId = page.afterId ?? undefined
    }

    expect(seen).toEqual([pages[2]!.landingPageId, pages[0]!.landingPageId])
    expect(emptyContinuation).toBe(true)
  })
})
