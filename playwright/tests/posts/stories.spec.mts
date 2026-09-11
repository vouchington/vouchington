import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { DESKTOP_VIEWPORT } from '../../helpers/viewport-constants.mts'

test.describe('Stories Page', () => {
  test('should display stories list page', async ({ page }) => {
    await navigateTo(page, '/stories')

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Stories')
    await expect(page.getByTestId('list-filters-search-input')).toBeVisible()
  })

  test('search, sort dropdown, and view toggle all render at desktop viewport', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
    await navigateTo(page, '/stories')

    const searchInput = page.getByTestId('list-filters-search-input')
    const sortSelect = page.getByTestId('list-filters-sort-trigger')
    const viewDropdown = page.getByTestId('post-view-toggle-trigger')

    await expect(searchInput).toBeVisible()
    await expect(sortSelect).toBeVisible()
    await expect(viewDropdown).toBeVisible()

    const searchBox = await searchInput.boundingBox()
    const sortBox = await sortSelect.boundingBox()
    const viewBox = await viewDropdown.boundingBox()

    expect(searchBox).not.toBeNull()
    expect(sortBox).not.toBeNull()
    expect(viewBox).not.toBeNull()

    expect(searchBox?.width).toBeGreaterThan(0)
    expect(sortBox?.width).toBeGreaterThan(0)
    expect(viewBox?.width).toBeGreaterThan(0)
  })
})
