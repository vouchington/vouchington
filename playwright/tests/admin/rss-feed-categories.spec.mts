import { test, expect } from '../../helpers/test.mts'
import { loginAsAdmin } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

// Seeded by backend/scripts/seeds/playwright-test-data/rss-feed-categories.mts
const PENDING_CATEGORY = 'credit-cards-pw-test'
const REJECTED_CATEGORY = 'news-pw-test'

test.describe('Admin RSS Feed Categories', () => {
  test('should redirect non-admin users to home', async ({ page }) => {
    await navigateTo(page, '/rss-feed-categories')
    await expect(page).toHaveURL('/')
  })

  test('should display page header and pending category rows', async ({ page }) => {
    await loginAsAdmin(page)
    await navigateTo(page, '/rss-feed-categories')
    await expect(page.getByTestId('admin-page-header-title')).toHaveText('RSS Feed Categories')
    await expect(page.getByTestId(`rss-category-row-${PENDING_CATEGORY}`)).toBeVisible()
  })

  test('should show row actions for a pending category', async ({ page }) => {
    await loginAsAdmin(page)
    await navigateTo(page, '/rss-feed-categories')
    await expect(page.getByTestId(`category-row-actions-${PENDING_CATEGORY}`)).toBeVisible()
    await expect(page.getByTestId(`category-reject-${PENDING_CATEGORY}`)).toBeVisible()
    await expect(page.getByTestId(`category-create-topic-${PENDING_CATEGORY}`)).toBeVisible()
  })

  test('should show rejected category row with unreject button', async ({ page }) => {
    await loginAsAdmin(page)
    await navigateTo(page, '/rss-feed-categories?status=rejected')
    await expect(page.getByTestId(`rss-category-row-${REJECTED_CATEGORY}`)).toBeVisible()
    await expect(page.getByTestId(`category-unreject-${REJECTED_CATEGORY}`)).toBeVisible()
  })

  test('should show empty state or results on all-status view', async ({ page }) => {
    await loginAsAdmin(page)
    await navigateTo(page, '/rss-feed-categories?status=all')
    // Either results show or the empty state shows (depends on DB state)
    await expect(
      page
        .getByTestId(`rss-category-row-${PENDING_CATEGORY}`)
        .or(page.getByTestId('rss-categories-empty')),
    ).toBeVisible()
  })

  test('should show status filter component', async ({ page }) => {
    await loginAsAdmin(page)
    await navigateTo(page, '/rss-feed-categories')
    await expect(page.getByTestId('rss-category-status-filter')).toBeVisible()
  })
})
