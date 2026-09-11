import { test, expect } from '../../helpers/test.mts'

import { navigateTo } from '../../helpers/navigate-to.mts'

import { AUTH_STATE } from '../../helpers/auth-state.mts'

import { assertNoHorizontalScroll } from '../../helpers/mobile-assertions.mts'

import { MOBILE_VIEWPORTS } from '../../helpers/viewport-constants.mts'

test.describe('News page modal and layout checks', () => {
  test.use({ storageState: AUTH_STATE })

  test('/news modal fits smallest mobile viewport with left-aligned title', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORTS.smallest)
    await navigateTo(page, '/news')

    const showMore = page.getByTestId('news-item-show-more-link')
    await expect
      .poll(() => showMore.count(), {
        message: 'seeded news articles with excerpts should be visible',
      })
      .toBeGreaterThan(0)

    await showMore.first().click()
    await page.waitForURL(/rss_item=/)

    const dialog = page.getByTestId('rss-feed-item-modal')
    await expect(dialog).toBeVisible()
    await assertNoHorizontalScroll(page)

    const dialogBox = await dialog.boundingBox()
    expect(dialogBox).not.toBeNull()
    expect(dialogBox!.x).toBeGreaterThanOrEqual(0)
    expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(MOBILE_VIEWPORTS.smallest.width)

    const titleAlign = await dialog
      .getByTestId('rss-feed-item-modal-title')
      .evaluate(el => getComputedStyle(el).textAlign)
    expect(titleAlign).toBe('left')

    const controlBoxes = await dialog
      .locator(
        [
          '[data-pw="rss-feed-item-modal-previous-button"]',
          '[data-pw="news-item-modal-vote"]',
          '[data-pw="rss-feed-item-modal-next-button"]',
        ].join(','),
      )
      .evaluateAll(elements =>
        elements.map(element => {
          const rect = element.getBoundingClientRect()
          return { left: rect.left, right: rect.right }
        }),
      )

    for (const box of controlBoxes) {
      expect(box.left).toBeGreaterThanOrEqual(0)
      expect(box.right).toBeLessThanOrEqual(MOBILE_VIEWPORTS.smallest.width)
    }
  })

  test('/news modal signed-in mobile footer exposes secondary actions in More menu', async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORTS['iphone-se'])
    await navigateTo(page, '/news')

    const showMore = page.getByTestId('news-item-show-more-link')
    await expect
      .poll(() => showMore.count(), {
        message: 'seeded news articles with excerpts should be visible',
      })
      .toBeGreaterThan(0)

    await showMore.first().click()
    await page.waitForURL(/rss_item=/)

    const dialog = page.getByTestId('rss-feed-item-modal')
    await expect(dialog).toBeVisible()
    await assertNoHorizontalScroll(page)

    const more = dialog.getByTestId('rss-feed-item-modal-more-actions-button')
    await expect(more).toBeVisible()
    await more.click()

    await expect(page.getByTestId('hide-menu-item')).toBeVisible()
    await expect(page.getByTestId('save-menu-item')).toBeVisible()
    // Report lives only inside the ... menu — not as a standalone button
    await expect(page.getByTestId('report-menu-item')).toBeVisible()
  })

  test('/news modal footer does not show a standalone report button', async ({ page }) => {
    await navigateTo(page, '/news')

    const showMore = page.getByTestId('news-item-show-more-link')
    await expect
      .poll(() => showMore.count(), {
        message: 'seeded news articles with excerpts should be visible',
      })
      .toBeGreaterThan(0)

    await showMore.first().click()
    await page.waitForURL(/rss_item=/)

    const dialog = page.getByTestId('rss-feed-item-modal')
    await expect(dialog).toBeVisible()

    // Report must not appear as an inline button in the footer — only inside the ... menu
    await expect(dialog.getByTestId('report-inline-button')).toHaveCount(0)
  })

  test('/news modal title includes an external-link icon after the title text', async ({
    page,
  }) => {
    await navigateTo(page, '/news')

    const showMore = page.getByTestId('news-item-show-more-link')
    await expect
      .poll(() => showMore.count(), {
        message: 'seeded news articles with excerpts should be visible',
      })
      .toBeGreaterThan(0)

    await showMore.first().click()
    await page.waitForURL(/rss_item=/)

    const dialog = page.getByTestId('rss-feed-item-modal')
    await expect(dialog).toBeVisible()

    // The modal title must be an external anchor with an SVG icon as the last child.
    const titleLink = page.getByTestId('rss-feed-item-modal-title-link')
    await expect(titleLink).toBeVisible()
    await expect(titleLink.locator('svg')).toBeVisible()
    const svgIsLastChild = await titleLink.evaluate(
      el => el.lastElementChild?.tagName.toLowerCase() === 'svg',
    )
    expect(svgIsLastChild).toBe(true)
  })

  test('/news renders browse-page-heading and content-container elements', async ({ page }) => {
    await navigateTo(page, '/news')

    await expect(page.getByTestId('browse-page-heading').first()).toBeVisible()
    await expect(page.getByTestId('content-container').first()).toBeVisible()

    const cards = page.getByTestId('news-item-card')
    await expect
      .poll(() => cards.count(), { message: 'seeded news articles should be visible' })
      .toBeGreaterThan(0)
  })

  test('/news paginated-list-retry is not visible on initial load', async ({ page }) => {
    await navigateTo(page, '/news')
    await expect(page.getByTestId('paginated-list-retry')).toHaveCount(0)
  })
})
