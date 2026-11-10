import { test, expect } from '../../helpers/test.mts'
import { navigateTo, waitForBelowFoldHydration } from 'vouchington-tooling/playwright'

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

  test('keeps the selected time range in the URL and drops it at the default', async ({ page }) => {
    await navigateTo(page, '/posts')
    await waitForBelowFoldHydration(page)
    await expect(page.getByTestId('post-time-range-trigger')).toContainText('Default')

    await page.getByTestId('post-time-range-trigger').press(' ')
    await page.getByTestId('post-time-range-option-all').click()
    await expect(page).toHaveURL(/time_range=all/)

    await page.reload()
    await expect(page.getByTestId('post-time-range-trigger')).toContainText('All')

    await page.getByTestId('post-time-range-trigger').press(' ')
    await page.getByTestId('post-time-range-option-1m').click()
    await expect(page).toHaveURL(/time_range=1m/)
    await expect(page.getByTestId('post-time-range-trigger')).toContainText('30')

    await page.getByTestId('post-time-range-trigger').press(' ')
    await page.getByTestId('post-time-range-option-default').click()
    await expect(page).not.toHaveURL(/time_range=/)
    await expect(page.getByTestId('post-time-range-trigger')).toContainText('Default')
  })

  test('does not show a separate Post Type filter', async ({ page }) => {
    await navigateTo(page, '/posts')

    await expect(page.getByTestId('post-filters-type-trigger')).toHaveCount(0)
  })
})
