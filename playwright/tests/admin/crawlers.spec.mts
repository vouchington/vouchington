import { test, expect, type Page } from '../../helpers/test.mts'
import { insertTestCrawler } from '../../helpers/insert-test-crawler.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'

// Seeded crawler for read-only tests
const SEEDED_CRAWLER_ID = '019c64e6-3000-7000-8000-000000000001'

test.describe('Admin Crawlers list', () => {
  test.use({ storageState: AUTH_STATE })

  test('should show crawlers list page with heading and table', async ({ page }) => {
    await navigateTo(page, '/crawlers')

    await expect(page.getByTestId('crawlers-list-heading')).toBeVisible()
    await expect(page.getByTestId('crawlers-table')).toBeVisible()
    await expect(page.getByTestId('crawler-row').first()).toBeVisible()
  })

  test('should redirect unauthenticated users from crawlers list', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, '/crawlers')
    await expect(page).toHaveURL('/')
  })
})

test.describe('Admin Crawlers', () => {
  test.use({ storageState: AUTH_STATE })
  test.describe.configure({ mode: 'serial' })

  let crawlerId: string

  async function waitForCrawlerEditHydration(page: Page) {
    await page.locator('form[data-hydrated="true"]').waitFor()
  }

  test.beforeAll(async () => {
    crawlerId = await insertTestCrawler('Mutable test crawler')
  })

  test('should redirect unauthenticated users to home', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, `/crawler/${SEEDED_CRAWLER_ID}`)
    await expect(page).toHaveURL('/')
  })

  test('should allow admin to view crawler detail', async ({ page }) => {
    await navigateTo(page, `/crawler/${SEEDED_CRAWLER_ID}`)

    await expect(page.getByTestId('crawler-detail-heading')).toContainText('Crawler Details')
    const details = page.locator('dl')
    await expect(details).toContainText('Example.com crawler')
    await expect(details).toContainText('fetch')
    await expect(details).toContainText('.ads')
    await expect(details).toContainText('.sidebar')
    await expect(page.getByTestId('crawler-edit-link')).toBeVisible()

    // Layout: page is constrained by PageWithAside wrapper (no full-bleed content)
    const pageWrapper = page.getByTestId('page-content-wrapper')
    await expect(pageWrapper).toBeVisible()
  })

  test('should navigate to crawler edit page', async ({ page }) => {
    await navigateTo(page, `/crawler/${crawlerId}/edit`)
    await waitForCrawlerEditHydration(page)

    await expect(page.getByTestId('crawler-edit-heading')).toContainText('Edit Crawler')
    await expect(page.getByTestId('crawler-description-input')).toBeVisible()
    await expect(page.getByTestId('crawler-type-select')).toBeVisible()
    await expect(page.getByTestId('crawler-priority-input')).toBeVisible()
    await expect(page.getByTestId('crawler-css-selectors-to-remove-input')).toBeVisible()
    await expect(page.getByTestId('crawler-link-text-content-to-remove-input')).toBeVisible()
    await expect(page.getByTestId('crawler-link-hrefs-to-remove-input')).toBeVisible()
  })

  test('should keep crawler detail accessible after a reload', async ({ page }) => {
    await navigateTo(page, `/crawler/${SEEDED_CRAWLER_ID}`)

    await page.reload()

    await expect(page.getByTestId('crawler-detail-heading')).toContainText('Crawler Details')
    await expect(page.getByTestId('crawler-edit-link')).toBeVisible()
  })

  test('should update crawler description', async ({ page }) => {
    await navigateTo(page, `/crawler/${crawlerId}/edit`)
    await waitForCrawlerEditHydration(page)

    await page.getByTestId('crawler-description-input').fill('Updated crawler description')

    await page.getByTestId('crawler-save-button').click()
    await page.waitForURL(`/crawler/${crawlerId}`)

    await expect(page.locator('dl')).toContainText('Updated crawler description')
  })

  test('should cancel crawler edit', async ({ page }) => {
    await navigateTo(page, `/crawler/${crawlerId}`)
    // Snapshot the live detail text ourselves rather than hardcoding a prior
    // sibling test's output — this keeps the check correct regardless of
    // what earlier serial-mode tests did, and even if this test is ever run
    // in isolation.
    const descriptionBeforeEdit = (await page.locator('dl').textContent()) ?? ''

    await navigateTo(page, `/crawler/${crawlerId}/edit`)
    await waitForCrawlerEditHydration(page)

    // Type a change that must NOT survive a cancel.
    await page.getByTestId('crawler-description-input').fill('Description that must not be saved')

    await page.getByTestId('crawler-cancel-link').click()
    await expect(page).toHaveURL(`/crawler/${crawlerId}`)

    // Cancel must restore exactly what was showing before this test's own
    // edit — not silently persist it.
    await expect(page.locator('dl')).toHaveText(descriptionBeforeEdit)
  })

  test('should update crawler type', async ({ page }) => {
    await navigateTo(page, `/crawler/${crawlerId}/edit`)
    await waitForCrawlerEditHydration(page)

    await page.getByTestId('crawler-type-select').click()
    const option = page.locator('[role="option"]').filter({ hasText: /automation/i })
    await option.click()
    await page.getByTestId('crawler-save-button').click()
    await page.waitForURL(`/crawler/${crawlerId}`)

    await expect(page.locator('dl')).toContainText('automation')
  })

  test('should update CSS selectors', async ({ page }) => {
    await navigateTo(page, `/crawler/${crawlerId}/edit`)
    await waitForCrawlerEditHydration(page)

    await page.getByTestId('crawler-css-selectors-to-remove-input').fill('.header\n.footer')
    await page.getByTestId('crawler-save-button').click()
    await page.waitForURL(`/crawler/${crawlerId}`)

    const details = page.locator('dl')
    await expect(details).toContainText('.header')
    await expect(details).toContainText('.footer')
  })
})
