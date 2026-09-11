import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

test.describe('BrowsePageHeader', () => {
  test('news page renders browse heading and cross-intent dropdown', async ({ page }) => {
    await navigateTo(page, '/news')

    await expect(page.getByTestId('browse-page-heading')).toBeVisible()
    await expect(page.getByTestId('browse-title-dropdown-trigger')).toBeVisible()
    await expect(page.getByTestId('browse-page-description')).toBeVisible()
  })

  test('news-sources page renders browse heading and cross-intent dropdown', async ({ page }) => {
    await navigateTo(page, '/news-sources')

    await expect(page.getByTestId('browse-page-heading')).toBeVisible()
    await expect(page.getByTestId('browse-title-dropdown-trigger')).toBeVisible()
  })
})
