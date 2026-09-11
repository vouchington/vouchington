import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'
import { MOBILE_VIEWPORTS } from '../../helpers/viewport-constants.mts'
import { assertNoHorizontalScroll } from '../../helpers/mobile-assertions.mts'
import { ensureSidebarOpen } from '../../helpers/layout-collapse.mts'
import { requireTestValue } from '../../helpers/assertions.mts'

test.describe('Feed Routes', () => {
  test.use({ storageState: AUTH_STATE })

  test('/feed redirects to /feed/posts', async ({ page }) => {
    await navigateTo(page, '/feed')
    await expect(page).toHaveURL(/\/feed\/posts/)
  })

  test('/feed/posts renders with dropdown filters', async ({ page }) => {
    await navigateTo(page, '/feed/posts')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('My Posts Feed')
    await expect(page.getByTestId('feed-title-dropdown-trigger')).toBeVisible()
    await expect(page.getByTestId('feed-sub-filter-trigger')).toContainText('Following')
    await expect(page.getByTestId('post-view-toggle-trigger')).toBeVisible()
    await expect(page.getByTestId('post-filters-type-trigger')).toBeHidden()
    await expect(page.getByTestId('community-filter')).toBeHidden()
  })

  test('/feed/posts/friends renders with correct active tab', async ({ page }) => {
    await navigateTo(page, '/feed/posts/friends')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('My Posts Feed')
    await expect(page.getByTestId('feed-sub-filter-trigger')).toContainText('Friends')
  })

  test('/feed/posts/topics renders with correct active tab', async ({ page }) => {
    await navigateTo(page, '/feed/posts/topics')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('My Posts Feed')
    await expect(page.getByTestId('feed-sub-filter-trigger')).toContainText('Topics')
  })

  test('/feed/news renders with dropdown filters', async ({ page }) => {
    await navigateTo(page, '/feed/news')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('My News Feed')
    await expect(page.getByTestId('feed-title-dropdown-trigger')).toBeVisible()
    await expect(page.getByTestId('feed-sub-filter-trigger')).toContainText('Following')
    await expect(page.getByTestId('feed-view-toggle-trigger')).toBeVisible()
    await expect(page.getByTestId('community-filter')).toBeHidden()
  })

  test('/feed pages stay within the mobile viewport', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORTS['iphone-se'])

    await navigateTo(page, '/feed/posts')
    await assertNoHorizontalScroll(page)

    await navigateTo(page, '/feed/news')
    await assertNoHorizontalScroll(page)
  })

  test('/feed/news renders seeded news articles', async ({ page }) => {
    await navigateTo(page, '/feed/news')
    const titleLinks = page.getByTestId('news-item-title-link')
    await expect(titleLinks.first()).toBeVisible()
    await expect(titleLinks.first()).toHaveAttribute('target', '_blank')
    await expect.poll(() => titleLinks.count()).toBeGreaterThanOrEqual(2)
    await expect(titleLinks.nth(1)).toHaveAttribute('target', '_blank')
    await expect(page.getByTestId('news-item-actions-row').first()).toBeVisible()
  })

  test('/feed/news/sources renders with correct active tab', async ({ page }) => {
    await navigateTo(page, '/feed/news/sources')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('My News Feed')
    await expect(page.getByTestId('feed-sub-filter-trigger')).toContainText('Sources')
  })

  test('/feed/news/topics renders with correct active tab', async ({ page }) => {
    await navigateTo(page, '/feed/news/topics')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('My News Feed')
    await expect(page.getByTestId('feed-sub-filter-trigger')).toContainText('Topics')
  })

  test.describe('anonymous', () => {
    // Clear auth cookies (not storageState) so the inherited cookie-consent
    // localStorage stays set and the consent banner doesn't reappear.
    test.beforeEach(async ({ page }) => {
      await page.context().clearCookies()
    })

    test('feed routes redirect to /login when not logged in', async ({ page }) => {
      await navigateTo(page, '/feed/posts')
      await expect(page).toHaveURL(/\/login/)
    })
  })

  test('sidebar shows feed links when logged in', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await navigateTo(page, '/feed/posts')
    await waitForBelowFoldHydration(page)
    await ensureSidebarOpen(page)
    const sidebar = page.locator('[data-sidebar="sidebar"]')
    await expect(sidebar).toBeVisible()
    await expect(sidebar.getByTestId('sidebar-nav-your-posts')).toBeVisible()

    await navigateTo(page, '/feed/news')
    await ensureSidebarOpen(page)
    await expect(sidebar.getByTestId('sidebar-nav-your-news')).toBeVisible()
  })

  test('sidebar My Posts Feed link navigates to /feed/posts without a 404', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await navigateTo(page, '/posts')
    await waitForBelowFoldHydration(page)

    await ensureSidebarOpen(page)

    const sidebar = page.locator('[data-sidebar="sidebar"]')
    const postsFeedLink = sidebar.getByTestId('sidebar-nav-your-posts')
    await expect(postsFeedLink).toBeVisible()

    const feedResponsePromise = page.waitForResponse(response => {
      const url = new URL(response.url())
      return url.pathname === '/feed/posts' && response.request().method() === 'GET'
    })

    await postsFeedLink.click()
    const feedResponse = await feedResponsePromise

    expect(feedResponse.status()).not.toBe(404)
    expect(feedResponse.status()).toBeLessThan(400)
    await expect(page).toHaveURL(/\/feed\/posts(?:\?|$)/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('My Posts Feed')
  })

  test('feed news item links open the modal and arrow keys navigate within the current list', async ({
    page,
  }) => {
    await navigateTo(page, '/feed/news')

    // Title links now open external URLs; use "Show more" to open the modal
    await page.getByTestId('news-item-card').getByTestId('news-item-show-more-link').first().click()
    await expect(page).toHaveURL(/rss_item=/)
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    const previousButton = dialog.getByTestId('rss-feed-item-modal-previous-button')
    const nextButton = dialog.getByTestId('rss-feed-item-modal-next-button')
    const startedAt = page.url()
    await expect(nextButton).not.toHaveAttribute('aria-disabled', 'true')
    await expect(previousButton).toBeVisible()
    await page.keyboard.press('ArrowRight')
    await expect(page).not.toHaveURL(startedAt)
    await page.keyboard.press('ArrowLeft')
    await expect(page).toHaveURL(startedAt)

    await page.keyboard.press('Escape')
    await expect(page).toHaveURL('/feed/news')
  })

  test('feed news modal nav follows expanded visible story items only', async ({ page }) => {
    await navigateTo(page, '/feed/news')
    await waitForBelowFoldHydration(page)

    const cluster = page
      .getByTestId('news-item-cluster')
      .filter({ hasText: 'Playwright Modal Story' })
    await expect(cluster).toBeVisible()

    const primaryTitle = cluster
      .getByTestId('news-item-title-link')
      .filter({ hasText: 'Playwright Modal Story Primary' })
    const relatedTitle = cluster
      .getByTestId('news-item-title-link')
      .filter({ hasText: 'Playwright Modal Story Related' })
    await expect(primaryTitle).toBeVisible()
    await expect(relatedTitle).toBeHidden()

    const primaryShowMore = cluster.getByTestId('news-item-show-more-link').first()
    await expect(primaryShowMore).toHaveAttribute('href')
    const collapsedHref = requireTestValue(
      await primaryShowMore.getAttribute('href'),
      'Expected collapsed Show more link href',
    )
    const collapsedParams = new URLSearchParams(collapsedHref.split('?')[1])
    expect(collapsedParams.get('rss_item')).toBeTruthy()
    expect(collapsedParams.get('rss_item_nav')).toBeNull()

    const toggle = cluster.getByTestId('news-item-cluster-related-toggle')
    await toggle.click()
    await expect(relatedTitle).toBeVisible()

    const relatedShowMore = cluster.getByTestId('news-item-show-more-link').last()
    await expect(relatedShowMore).toHaveAttribute('href')
    const relatedHref = requireTestValue(
      await relatedShowMore.getAttribute('href'),
      'Expected related Show more link href',
    )
    const relatedId = new URLSearchParams(relatedHref.split('?')[1]).get('rss_item')
    expect(relatedId).toBeTruthy()

    await primaryShowMore.click()
    await expect(page).toHaveURL(/rss_item=/)

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await page.keyboard.press('ArrowRight')
    await expect(dialog.getByRole('heading')).toContainText('Playwright Modal Story Related')
  })

  test('title links on feed news items include nofollow', async ({ page }) => {
    await navigateTo(page, '/feed/news')

    const titleLink = page
      .getByTestId('news-item-title-link')
      .filter({ hasText: 'Test News Article 1' })
    await expect(titleLink).toBeVisible()
    await expect(titleLink).toHaveAttribute('rel', 'nofollow noopener noreferrer')
  })

  test('direct rss item modal URLs on list pages enable navigation via client context', async ({
    page,
  }) => {
    await navigateTo(page, '/feed/news')

    // Get the rss_item UUID from the "Show more" link (title links now go to external URLs)
    const showMoreLink = page
      .getByTestId('news-item-card')
      .getByTestId('news-item-show-more-link')
      .first()
    await expect(showMoreLink).toBeVisible()
    const href = requireTestValue(
      await showMoreLink.getAttribute('href'),
      'Expected feed news Show more link href',
    )
    const rssItemId = requireTestValue(
      new URLSearchParams(href.split('?')[1]).get('rss_item'),
      'Expected RSS item ID in feed news Show more link',
    )

    // Navigate directly with only rss_item — the page's RssItemNavProvider still provides context
    await navigateTo(page, `/feed/news?rss_item=${rssItemId}`)

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    // Navigation is enabled because the feed page always wraps items in RssItemNavProvider
    await expect(dialog.getByTestId('rss-feed-item-modal-next-button')).not.toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })
})
