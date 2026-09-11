import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'

test.describe('Cards Page', () => {
  test('should display cards list page', async ({ page }) => {
    await navigateTo(page, '/cards')
    await waitForBelowFoldHydration(page)

    // Check page title
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Cards')
    await expect(page.getByTestId('topic-card').first()).toBeVisible()

    // Check for search input
    await expect(page.getByTestId('list-filters-search-input')).toBeVisible()

    // Check for sort filter dropdown options
    await page.getByTestId('list-filters-sort-trigger').press(' ')
    await expect(page.getByTestId('list-filters-sort-option-new')).toBeVisible()
    await expect(page.getByTestId('list-filters-sort-option-best')).toBeVisible()
  })

  test('should filter by sort order', async ({ page }) => {
    await navigateTo(page, '/cards')
    await waitForBelowFoldHydration(page)

    // Select Best sort order
    await page.getByTestId('list-filters-sort-trigger').press(' ')
    await page.getByTestId('list-filters-sort-option-best').click()

    // URL should update with sort parameter
    await expect(page).toHaveURL(/sort=best/)
  })

  test('should be mobile responsive', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await navigateTo(page, '/cards')

    // Page should still be visible
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    // Filters should remain usable on mobile
    const content = page.getByTestId('page-content-wrapper')
    await expect(content.getByTestId('list-filters-search-input')).toBeVisible()
    await expect(content.getByTestId('list-filters-search-submit')).toBeVisible()
    await expect(content.getByTestId('list-filters-sort-trigger')).toBeVisible()
  })
})
