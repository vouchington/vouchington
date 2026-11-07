import { describe, expect, it } from 'vitest'
import {
  createTestLandingPage,
  createTestLandingPageLinkItem,
  createTestUser,
  softDeleteUser,
} from '@voucha/test-helpers'
import { readSitemapFamilyPage } from './family-queries.mts'

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
    const highWaterId = pages[2]!.landingPageId

    const rows = await readSitemapFamilyPage('landing-pages', { highWaterId, limit: 2 })
    expect(rows).toHaveLength(2)
    expect(rows[0]?.id).toBe(pages[2]!.landingPageId)
    expect(rows.map(row => row.id)).not.toContain(pages[1]!.landingPageId)
    const older = await readSitemapFamilyPage('landing-pages', {
      highWaterId,
      afterId: pages[1]!.landingPageId,
      limit: 100,
    })
    expect(older.map(row => row.id)).toContain(pages[0]!.landingPageId)
  })
})
