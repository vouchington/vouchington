import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'

test.describe('All Posts Page', () => {
  test('should display all posts list page with title dropdown default "All"', async ({ page }) => {
    await navigateTo(page, '/posts')

    await expect(page.getByTestId('post-type-title-dropdown-trigger')).toContainText('All')
    await expect(page.getByTestId('list-filters-search-input')).toBeVisible()
  })

  test('should filter by sort order', async ({ page }) => {
    await navigateTo(page, '/posts')
    await waitForBelowFoldHydration(page)
    await page.getByTestId('list-filters-sort-trigger').press(' ')
    await page.getByTestId('list-filters-sort-option-new').click()

    await expect(page).toHaveURL(/.*sort=new/)
  })

  test('does not show a separate Post Type filter', async ({ page }) => {
    await navigateTo(page, '/posts')

    await expect(page.getByTestId('post-filters-type-trigger')).toHaveCount(0)
  })
})
