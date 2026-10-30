import { randomUUID } from 'node:crypto'
import { test, expect, protectPlaywrightHookTimeouts } from '../../helpers/test.mts'
import {
  navigateTo,
  randomSuffix,
  requireTestValue,
  waitForBelowFoldHydration,
} from 'vouchington-tooling/playwright'
import { ADMIN_AUTH_STATE } from '../../helpers/auth-state.mts'
import {
  createTestUser,
  insertTestCrawl,
  insertTestRssFeedWithUrlId,
  insertTestTopic,
  insertTestUrl,
  insertTestUrlDirect,
  insertTestUrlHostname,
} from '../../../backend/test-helpers/index.mts'

test.describe('Admin URLs', () => {
  test.use({ storageState: ADMIN_AUTH_STATE })
  let hostname = ''
  let page1Url = ''
  let page2Url = ''
  let page1Id = ''
  let crawlId = ''
  let rssUrl = ''
  let searchToken = ''

  test.beforeAll(async () => {
    protectPlaywrightHookTimeouts(test.info())
    const suffix = randomSuffix()
    hostname = `pw-urls-${suffix}.example.net`
    searchToken = `pw-url-${suffix}-page1`
    page1Url = `https://${hostname}/${searchToken}`
    page2Url = `https://${hostname}/pw-url-${suffix}-page2`
    const [hostnameId, maybeOwner] = await Promise.all([
      insertTestUrlHostname({ hostname }),
      createTestUser(),
    ])
    const owner = requireTestValue(maybeOwner, 'Failed to create RSS feed owner')
    const [firstUrlId, , topicId] = await Promise.all([
      insertTestUrl({ url: page1Url, hostnameId }),
      insertTestUrl({ url: page2Url, hostnameId }),
      insertTestTopic({
        name: `Playwright URL feed ${suffix}`,
        slug: `pw-url-feed-${suffix}`,
        createdById: owner.id,
      }),
    ])
    page1Id = firstUrlId
    rssUrl = `https://feed-${suffix}.example.net/feed.xml`
    const [crawl] = await Promise.all([
      insertTestCrawl({
        urlId: page1Id,
        statusCode: 200,
        markdown: '# Test Page 1',
        title: 'Test Page 1',
      }),
      insertTestRssFeedWithUrlId({
        topicId,
        title: `Playwright URL feed ${suffix}`,
        rssFeedUrl: rssUrl,
        homePageUrl: `https://feed-${suffix}.example.net/`,
      }),
    ])
    crawlId = crawl.id
  })

  test.describe('encoded URL route', () => {
    let encodedUrl = ''
    let encodedCrawlId = ''
    let encodedCrawlTitle = ''

    test.beforeAll(async () => {
      protectPlaywrightHookTimeouts(test.info())
      const suffix = randomUUID()
      const rawUrl = `https://example.com/roundtrip-${suffix}/a%2Fb?q=one%26two`
      const decodedDecoy = `https://example.com/roundtrip-${suffix}/a/b?q=one&two`
      const url = requireTestValue(
        await insertTestUrlDirect(null, rawUrl),
        'Failed to create encoded URL fixture',
      )
      await insertTestUrlDirect(null, decodedDecoy)
      encodedUrl = rawUrl
      encodedCrawlTitle = `Encoded path crawl ${suffix}`
      const crawl = await insertTestCrawl({
        urlId: url.id,
        statusCode: 200,
        title: encodedCrawlTitle,
        markdown: `Only the encoded URL has this crawl: ${suffix}`,
      })
      encodedCrawlId = crawl.id
    })

    test('round-trips an encoded URL through its detail page and crawl link', async ({ page }) => {
      const detailPath = `/url/${encodeURIComponent(encodedUrl)}`
      const crawlPath = `${detailPath}/crawls/${encodedCrawlId}`
      await navigateTo(page, detailPath)

      await expect(page.getByRole('heading', { level: 1 })).toHaveText(encodedUrl)
      await expect(page.getByTestId('url-page-source-link')).toHaveAttribute('href', encodedUrl)

      const viewCrawl = page.locator('tbody tr').getByRole('link')
      await expect(viewCrawl).toHaveAttribute('href', crawlPath)
      await viewCrawl.click()

      await expect(page).toHaveURL(crawlPath)
      await expect(page.getByRole('heading', { level: 1 })).toContainText('Crawl Details')
      await expect(page.locator('main')).toContainText(encodedCrawlTitle)
      await expect(page.locator('main')).toContainText('Only the encoded URL has this crawl')
    })
  })

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

    // Search for this spec's URL so pagination cannot hide it.
    const searchInput = page.getByTestId('client-search-input')
    await searchInput.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)
    await searchInput.pressSequentially(page1Url)
    await page.getByTestId('client-search-submit').click()

    // Check that test URL is visible
    await expect(page.locator('main')).toContainText(page1Url)
    const nextPageLinks = page.locator('a').filter({ hasText: 'Next Page' })
    await expect(nextPageLinks).toHaveCount(0)

    // URL text opens externally
    const urlExternalLink = page
      .getByTestId('url-list-page-external-link')
      .filter({ hasText: page1Url })
      .first()
    await expect(urlExternalLink).toHaveAttribute('href', page1Url)
    await expect(urlExternalLink).toHaveAttribute('target', '_blank')
    await expect(page.getByTestId('url-list-page-view').first()).toBeVisible()

    // Hostname links to the in-app domain page
    await expect(page.getByTestId('url-hostname-link').first()).toHaveAttribute(
      'href',
      `/domain/${hostname}`,
    )
  })

  test('should search URLs by query', async ({ page }) => {
    await navigateTo(page, '/urls')

    // Search for this spec's unique page path.
    const searchInput = page.getByTestId('client-search-input')
    await searchInput.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)
    await searchInput.pressSequentially(searchToken)
    await page.evaluate(() => {
      ;(window as typeof window & { __clientSearchMarker?: string }).__clientSearchMarker =
        'urls-search'
    })
    await page.getByTestId('client-search-submit').click()

    await expect(page).toHaveURL(/\/urls\?query=pw-url-/)
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as typeof window & { __clientSearchMarker?: string }).__clientSearchMarker,
        ),
      )
      .toBe('urls-search')
    await expect(page.locator('main')).toContainText(page1Url)
    await expect(page.locator('main')).not.toContainText(page2Url)
  })

  test('should view URL detail with inline crawls list', async ({ page }) => {
    await navigateTo(page, `/url/${encodeURIComponent(page1Url)}`)

    await expect(page).toHaveURL(`/url/${encodeURIComponent(page1Url)}`)

    // h1 is the URL string itself
    await expect(page.getByRole('heading', { level: 1 })).toContainText(page1Url)

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
    const triggerCrawlBtn = page.getByTestId('trigger-url-crawl-button-crawl')
    await expect(triggerCrawlBtn).toBeVisible()
  })

  test('shows the RSS sync control on a feed URL', async ({ page }) => {
    await navigateTo(page, `/url/${encodeURIComponent(rssUrl)}`)
    await expect(page.getByTestId('trigger-url-crawl-button-rss-sync')).toBeVisible()
  })

  test('should trigger URL crawl', async ({ page }) => {
    await navigateTo(page, `/url/${encodeURIComponent(page1Url)}`)
    await expect(page).toHaveURL(`/url/${encodeURIComponent(page1Url)}`)

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
    await expect(page).toHaveURL(`/url/${encodeURIComponent(page1Url)}`)
    // h1 still shows the URL
    await expect(page.getByRole('heading', { level: 1 })).toContainText(page1Url)
  })

  test('should view individual crawl detail', async ({ page }) => {
    await navigateTo(page, `/url/${encodeURIComponent(page1Url)}/crawls/${crawlId}`)

    await expect(page).toHaveURL(`/url/${encodeURIComponent(page1Url)}/crawls/${crawlId}`)

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
