/**
 * Tests that the home page content fills the full 1200px column when both the left sidebar
 * and the right aside are collapsed. Previously the home page wrapped content in max-w-4xl
 * (~896px), making it appear narrower than the navbar. After the fix, home content fills
 * the same 1200px column as /news.
 */
import { expect, test } from '../../helpers/test.mts'
import {
  WIDE_VIEWPORT,
  collapseAside,
  collapseSidebar,
  getNavbarBox,
} from '../../helpers/layout-collapse.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

test.describe('Home content width matches header when both columns collapsed', () => {
  test('home content wrapper spans the full 1200px column after collapsing sidebar + aside', async ({
    page,
  }) => {
    await page.setViewportSize(WIDE_VIEWPORT)
    await navigateTo(page, '/')

    await collapseSidebar(page)
    await collapseAside(page)

    // The page-content-wrapper fills the 1200px column; the h1 parent fills the flex-1 column
    const contentWrapper = page.getByTestId('page-content-wrapper')
    const wrapperBox = await contentWrapper.boundingBox()
    expect(wrapperBox).not.toBeNull()

    const navBox = await getNavbarBox(page)

    // Content wrapper width should match the navbar's column width
    const TOLERANCE_PX = 16
    expect(Math.abs(wrapperBox!.width - navBox.width)).toBeLessThanOrEqual(TOLERANCE_PX)

    // Left edges should also align
    expect(Math.abs(wrapperBox!.x - navBox.x)).toBeLessThanOrEqual(TOLERANCE_PX)
  })

  test('home and news have the same content width when both columns are collapsed', async ({
    page,
  }) => {
    await page.setViewportSize(WIDE_VIEWPORT)

    // Collapse on home
    await navigateTo(page, '/')
    await collapseSidebar(page)
    await collapseAside(page)
    const homeWrapper = page.getByTestId('page-content-wrapper')
    const homeBox = await homeWrapper.boundingBox()
    expect(homeBox).not.toBeNull()

    // Navigate to news (sidebar stays collapsed across navigation via cookie)
    await navigateTo(page, '/news')
    await collapseAside(page)
    const newsWrapper = page.getByTestId('page-content-wrapper')
    const newsBox = await newsWrapper.boundingBox()
    expect(newsBox).not.toBeNull()

    const TOLERANCE_PX = 16
    expect(Math.abs(homeBox!.width - newsBox!.width)).toBeLessThanOrEqual(TOLERANCE_PX)
  })
})
