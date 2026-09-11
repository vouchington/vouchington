import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

test.describe('Blog Posts Page', () => {
  test('should display blog posts list page', async ({ page }) => {
    await navigateTo(page, '/blog')

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Voucha Blog')
    await expect(page.getByLabel('Search list')).toBeVisible()
  })
})
