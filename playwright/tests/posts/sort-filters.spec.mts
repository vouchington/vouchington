import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'

test.describe('Post sort filters', () => {
  test('shows Hot and New sort options by default', async ({ page }) => {
    await navigateTo(page, '/discussions')
    await waitForBelowFoldHydration(page)
    await page.getByTestId('list-filters-sort-trigger').press(' ')
    await expect(page.getByTestId('list-filters-sort-option-hot')).toBeVisible()
    await expect(page.getByTestId('list-filters-sort-option-new')).toBeVisible()
  })

  test('does not show Relevance sort option without a search query', async ({ page }) => {
    await navigateTo(page, '/discussions')
    await waitForBelowFoldHydration(page)
    await page.getByTestId('list-filters-sort-trigger').press(' ')
    await expect(page.getByTestId('list-filters-sort-option-relevance')).toBeHidden()
  })

  test('shows Relevance sort option when a search query is active', async ({ page }) => {
    await navigateTo(page, '/discussions?q=test')
    await waitForBelowFoldHydration(page)
    await page.getByTestId('list-filters-sort-trigger').press(' ')
    await expect(page.getByTestId('list-filters-sort-option-relevance')).toBeVisible()
  })

  test('sets sort=relevance in URL when search is submitted', async ({ page }) => {
    await navigateTo(page, '/discussions')
    await waitForBelowFoldHydration(page)
    const searchInput = page.getByTestId('list-filters-search-input')
    await searchInput.pressSequentially('chase')
    await searchInput.press('Enter')

    await expect(page).toHaveURL(/sort=relevance/)
    await expect(page).toHaveURL(/q=chase/)
    await expect(searchInput).toBeFocused()
    await page.getByTestId('list-filters-sort-trigger').press(' ')
    await expect(page.getByTestId('list-filters-sort-option-relevance')).toBeVisible()
    await page.keyboard.press('Escape')
  })

  test('Relevance sort option disappears after clearing search', async ({ page }) => {
    await navigateTo(page, '/discussions?q=test&sort=relevance')
    await waitForBelowFoldHydration(page)
    await page.getByTestId('list-filters-sort-trigger').press(' ')
    await expect(page.getByTestId('list-filters-sort-option-relevance')).toBeVisible()
    await page.keyboard.press('Escape')

    const searchInput = page.getByTestId('list-filters-search-input')
    await searchInput.clear()
    await searchInput.press('Enter')

    await expect(page).not.toHaveURL(/sort=relevance/)
    await page.getByTestId('list-filters-sort-trigger').press(' ')
    await expect(page.getByTestId('list-filters-sort-option-relevance')).toBeHidden()
  })

  test('selecting Hot sort updates URL', async ({ page }) => {
    await navigateTo(page, '/discussions?sort=new')
    await waitForBelowFoldHydration(page)
    await page.getByTestId('list-filters-sort-trigger').press(' ')
    await page.getByTestId('list-filters-sort-option-hot').click()

    await expect(page).toHaveURL(/sort=hot/)
  })
})
