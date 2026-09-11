/**
 * Tests that list pages fill the full 1200px column when both the left sidebar
 * and the right aside are collapsed. Previously PostListPage and TopicListPage
 * wrapped content in max-w-4xl (~896px), making content appear narrower than
 * the navbar when the aside was toggled closed.
 */
import { expect, test } from '../../helpers/test.mts'
import {
  WIDE_VIEWPORT,
  collapseAside,
  collapseSidebar,
  getNavbarBox,
} from '../../helpers/layout-collapse.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

test.describe('List page content width matches header when columns collapsed', () => {
  const TOLERANCE_PX = 16

  // Representative subset of PostListPage routes (also covers /stories, /reviews, /data-points
  // which share the same PostListPage component and are not exhaustively listed here)
  const postListPages = ['/discussions', '/posts', '/stories', '/reviews', '/data-points']

  // Representative subset of TopicListPage routes (also covers /cards, /rewards-programs,
  // /referral-programs, /spending-categories which share the same component).
  // /sources uses PageWithAside directly (no TopicListPage) but is included as a no-aside variant.
  const topicListPages = ['/topics', '/sources']

  for (const path of [...postListPages, ...topicListPages]) {
    test(`${path} content wrapper spans the full 1200px column after collapsing sidebar + aside`, async ({
      page,
    }) => {
      await page.setViewportSize(WIDE_VIEWPORT)
      await navigateTo(page, path)

      await collapseSidebar(page)
      await collapseAside(page)

      const contentWrapper = page.getByTestId('page-content-wrapper')
      const wrapperBox = await contentWrapper.boundingBox()
      expect(wrapperBox).not.toBeNull()

      const navBox = await getNavbarBox(page)

      expect(Math.abs(wrapperBox!.width - navBox.width)).toBeLessThanOrEqual(TOLERANCE_PX)
      expect(Math.abs(wrapperBox!.x - navBox.x)).toBeLessThanOrEqual(TOLERANCE_PX)
    })
  }

  test('discussions and news have the same content width when both columns are collapsed', async ({
    page,
  }) => {
    await page.setViewportSize(WIDE_VIEWPORT)

    await navigateTo(page, '/discussions')
    await collapseSidebar(page)
    await collapseAside(page)
    const discussionsBox = await page.getByTestId('page-content-wrapper').boundingBox()
    expect(discussionsBox).not.toBeNull()

    await navigateTo(page, '/news')
    await collapseAside(page)
    const newsBox = await page.getByTestId('page-content-wrapper').boundingBox()
    expect(newsBox).not.toBeNull()

    expect(Math.abs(discussionsBox!.width - newsBox!.width)).toBeLessThanOrEqual(TOLERANCE_PX)
  })

  test('topics and news have the same content width when both columns are collapsed', async ({
    page,
  }) => {
    await page.setViewportSize(WIDE_VIEWPORT)

    await navigateTo(page, '/topics')
    await collapseSidebar(page)
    await collapseAside(page)
    const topicsBox = await page.getByTestId('page-content-wrapper').boundingBox()
    expect(topicsBox).not.toBeNull()

    await navigateTo(page, '/news')
    await collapseAside(page)
    const newsBox = await page.getByTestId('page-content-wrapper').boundingBox()
    expect(newsBox).not.toBeNull()

    expect(Math.abs(topicsBox!.width - newsBox!.width)).toBeLessThanOrEqual(TOLERANCE_PX)
  })
})
