import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'

test.describe('Admin Domains', () => {
  test.use({ storageState: AUTH_STATE })

  test('allows anonymous users to view domains list without admin filters', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, '/domains')

    await expect(page).toHaveURL('/domains')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Domains')

    // Admin-only filter dropdowns should not be visible for non-admins
    const blockedFilter = page.locator('[aria-label="Blocked filter"]')
    const crawlableFilter = page.locator('[aria-label="Crawlable filter"]')
    await expect(blockedFilter).toBeHidden()
    await expect(crawlableFilter).toBeHidden()
  })

  test('should allow admin to view domains list with admin filters and quick-add form', async ({
    page,
  }) => {
    await navigateTo(page, '/domains')

    // Check page title
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Domains')

    // Admin-only filter dropdowns should be visible for admins
    const blockedFilterAdmin = page.locator('[aria-label="Blocked filter"]')
    const crawlableFilterAdmin = page.locator('[aria-label="Crawlable filter"]')
    await expect(blockedFilterAdmin).toBeVisible()
    await expect(crawlableFilterAdmin).toBeVisible()

    // Quick-add block form is visible for admins
    await expect(page.getByTestId('block-hostname-quick-add')).toBeVisible()

    await expect(page.getByTestId('domains-search-input')).toBeVisible()
  })

  test('should filter domains by search query', async ({ page }) => {
    await navigateTo(page, '/domains')

    // Search for a seeded hostname that is not shared by generated test data.
    await waitForBelowFoldHydration(page)
    await page.getByTestId('domains-search-input').pressSequentially('test.org')
    const searchButton = page.getByTestId('domains-search-submit')
    await searchButton.click()
    await expect(page).toHaveURL(/query=test\.org/)

    // Should see test.org
    await expect(
      page.getByTestId('domains-list-hostname-link').filter({ hasText: /^test\.org$/ }),
    ).toBeVisible()
  })

  test('should view domain detail with Moderation and Crawlers tabs', async ({ page }) => {
    await navigateTo(page, '/domain/example.com')

    await expect(page).toHaveURL('/domain/example.com')

    // Check hostname heading
    await expect(page.getByRole('heading', { level: 1 })).toContainText('example.com')

    // Click the Moderation menubar item to reveal moderation controls
    const moderationTab = page.getByTestId('domain-tab-moderation')
    await moderationTab.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)
    await moderationTab.click()
    await expect(moderationTab).toHaveAttribute('data-active', 'true')
    await expect(moderationTab).toHaveAttribute('aria-current', 'page')

    // Moderation controls should be visible with interactive switches
    await expect(page.getByTestId('hostname-moderation-controls')).toBeVisible()
    await expect(page.getByTestId('hostname-blocked-switch')).toBeVisible()
    await expect(page.getByTestId('hostname-crawlable-switch')).toBeVisible()
    await expect(page.getByTestId('hostname-link-rel-follow-switch')).toBeVisible()

    // Click the Crawlers menubar item to reveal crawler info
    const crawlersTab = page.getByTestId('domain-tab-crawlers')
    await crawlersTab.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)
    await crawlersTab.click()
    await expect(crawlersTab).toHaveAttribute('data-active', 'true')
    await expect(crawlersTab).toHaveAttribute('aria-current', 'page')

    // Check crawlers section
    const crawlersHeading = page.getByRole('heading', { level: 2 }).filter({ hasText: 'Crawlers' })
    await expect(crawlersHeading).toBeVisible()
    await expect(
      page.getByTestId('domain-crawler-description').filter({ hasText: 'Example.com crawler' }),
    ).toBeVisible()
  })

  test('should navigate between domain list and detail', async ({ page }) => {
    await navigateTo(page, '/domains')

    // Go to detail
    await navigateTo(page, '/domain/example.com')
    await expect(page).toHaveURL('/domain/example.com')

    // Back to list
    await page.goBack()
    await expect(page).toHaveURL('/domains')
  })
})
