import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'
import { requireTestValue } from '../../helpers/assertions.mts'
import { recentSeedCrawlId } from '../../../backend/scripts/seeds/crawl-ids.mts'

test.describe('Admin URLs', () => {
  test.use({ storageState: AUTH_STATE })

  test('should redirect unauthenticated users to login', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, '/urls')

    // Should redirect to login
    await expect(page).toHaveURL('/login')
  })

  test('should allow admin to view URLs list', async ({ page }) => {
    await navigateTo(page, '/urls')

    // Check page title
    await expect(page.getByTestId('page-header-title')).toContainText('URLs')

    // Search for a specific seed URL to verify it exists
    // (seed URLs have older IDs than vitest test data, so they may not appear on page 1 without filtering)
    const searchInput = page.getByTestId('client-search-input')
    await searchInput.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)
    await searchInput.pressSequentially('https://example.com/page1')
    await page.getByTestId('client-search-submit').click()

    // Check that test URL is visible
    await expect(page.locator('main')).toContainText('https://example.com/page1')
    const nextPageLinks = page.locator('a').filter({ hasText: 'Next Page' })
    await expect(nextPageLinks).toHaveCount(0)

    // URL text opens externally
    const urlExternalLink = page
      .getByTestId('external-link')
      .filter({ hasText: 'https://example.com/page1' })
      .first()
    await expect(urlExternalLink).toHaveAttribute('href', 'https://example.com/page1')
    await expect(urlExternalLink).toHaveAttribute('target', '_blank')

    // Hostname links to the in-app domain page
    await expect(page.getByTestId('url-hostname-link').first()).toHaveAttribute(
      'href',
      '/domain/example.com',
    )
  })

  test('should search URLs by query', async ({ page }) => {
    await navigateTo(page, '/urls')

    // Search for 'page1'
    const searchInput = page.getByTestId('client-search-input')
    await searchInput.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)
    await searchInput.pressSequentially('page1')
    await page.evaluate(() => {
      ;(window as typeof window & { __clientSearchMarker?: string }).__clientSearchMarker =
        'urls-search'
    })
    await page.getByTestId('client-search-submit').click()

    await expect(page).toHaveURL(/\/urls\?query=page1/)
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as typeof window & { __clientSearchMarker?: string }).__clientSearchMarker,
        ),
      )
      .toBe('urls-search')
    // Should see page1
    await expect(page.locator('main')).toContainText('https://example.com/page1')
    // Should not see page2
    await expect(page.locator('main')).not.toContainText('https://example.com/page2')
  })

  test('should view URL detail with inline crawls list', async ({ page }) => {
    // Navigate directly to avoid pagination issues (seed URLs are not on page 1 of the list)
    const urlId = '019c64e6-2000-7000-8000-000000000001'
    await navigateTo(page, `/url/${urlId}`)

    await expect(page).toHaveURL(/\/url\/[a-f0-9-]+/)

    // h1 is the URL string itself
    await expect(page.getByRole('heading', { level: 1 })).toContainText('https://example.com/page1')

    // Breadcrumbs: Web Search (link), Domains (link), URL (current page — span)
    const breadcrumbNav = page.getByTestId('breadcrumb-nav')
    await expect(breadcrumbNav).toBeVisible()
    await expect(breadcrumbNav.locator('a').filter({ hasText: 'Web Search' })).toBeVisible()
    await expect(breadcrumbNav.locator('a').filter({ hasText: 'Domains' })).toBeVisible()
    await expect(breadcrumbNav.locator('[aria-current="page"]')).toContainText('URL')

    // Inline crawls table renders with data
    await expect(page.locator('tbody tr').first()).toBeVisible()
    await expect(page.locator('tbody tr').first()).toContainText('200')

    // Trigger Crawl button is in the aside (complementary region)
    const triggerCrawlBtn = page.locator('button').filter({ hasText: /trigger crawl/i })
    await expect(triggerCrawlBtn).toBeVisible()
  })

  test('should trigger URL crawl', async ({ page }) => {
    // Navigate directly to avoid pagination issues (seed URLs are not on page 1 of the list)
    const urlId = '019c64e6-2000-7000-8000-000000000001'
    await navigateTo(page, `/url/${urlId}`)
    await expect(page).toHaveURL(/\/url\/[a-f0-9-]+/)

    // Click trigger crawl button
    const triggerCrawlBtn = page.locator('button').filter({ hasText: /trigger crawl/i })
    await triggerCrawlBtn.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)
    await triggerCrawlBtn.click()

    // Wait for success toast — crawl is async so only a toast is shown (no page refresh)
    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: 'Crawl enqueued' }),
    ).toBeVisible()

    // URL should not have changed
    await expect(page).toHaveURL(/\/url\/[a-f0-9-]+/)
    // h1 still shows the URL
    await expect(page.getByRole('heading', { level: 1 })).toContainText('https://example.com/page1')
  })

  test('should view individual crawl detail', async ({ page }) => {
    // Navigate directly to a known seed crawl to avoid interference from triggered crawls.
    // crawlId comes from crawl-ids.mts, which uses a guarded recent UTC day so it
    // matches what seedPlaywrightTestData() inserts across UTC midnight.
    const urlId = '019c64e6-2000-7000-8000-000000000001'
    const crawlId = recentSeedCrawlId(2)
    await navigateTo(page, `/url/${urlId}/crawls/${crawlId}`)

    await expect(page).toHaveURL(/\/url\/[a-f0-9-]+\/crawls\/[a-f0-9-]+/)

    // Check crawl detail page
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Crawl Details')
    await expect(page.locator('main').filter({ hasText: '200' }).first()).toBeVisible()

    // Breadcrumbs: Web Search > Domains > URL > Crawl (no intermediate "Crawls" crumb)
    // Web Search, Domains, URL are links; Crawl is the current page (span)
    const breadcrumbNav = page.locator('nav[aria-label="breadcrumb"]')
    await expect(breadcrumbNav.locator('a').filter({ hasText: 'Web Search' })).toBeVisible()
    await expect(breadcrumbNav.locator('a').filter({ hasText: 'Domains' })).toBeVisible()
    await expect(breadcrumbNav.locator('a').filter({ hasText: 'URL' })).toBeVisible()
    await expect(breadcrumbNav.locator('[aria-current="page"]')).toContainText('Crawl')

    // Check content section
    const contentHeading = page.getByRole('heading', { level: 2 }).filter({ hasText: 'Content' })
    await expect(contentHeading).toBeVisible()
    await expect(
      page
        .locator('main')
        .filter({ hasText: /Test Page 1/ })
        .first(),
    ).toBeVisible()

    // Layout: breadcrumbs and content share the same constrained column via PageWithAside
    const pageWrapper = page.getByTestId('page-content-wrapper')
    await expect(pageWrapper).toBeVisible()
    const wrapperBox = await pageWrapper.boundingBox()
    const breadcrumbBox = await breadcrumbNav.boundingBox()
    const wrapperLayout = requireTestValue(wrapperBox, 'Expected page content wrapper layout box')
    const breadcrumbLayout = requireTestValue(
      breadcrumbBox,
      'Expected breadcrumb navigation layout box',
    )
    // Breadcrumbs must be horizontally contained within the page wrapper (within 2px tolerance)
    expect(breadcrumbLayout.x).toBeGreaterThanOrEqual(wrapperLayout.x - 2)
    expect(breadcrumbLayout.x + breadcrumbLayout.width).toBeLessThanOrEqual(
      wrapperLayout.x + wrapperLayout.width + 2,
    )
  })
})
