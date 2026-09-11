import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

test.describe('Spending Categories Page', () => {
  test('should display spending categories list page', async ({ page }) => {
    await navigateTo(page, '/spending-categories')

    // Take initial screenshot

    // Check page title
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Spending Categories')

    // Check for search input
    await expect(page.getByLabel('Search list')).toBeVisible()
  })
})
