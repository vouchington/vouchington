import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

test.describe('Articles Page', () => {
  test('should display articles list page', async ({ page }) => {
    await navigateTo(page, '/articles')

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Articles')
    await expect(page.getByLabel('Search list')).toBeVisible()
  })
})
