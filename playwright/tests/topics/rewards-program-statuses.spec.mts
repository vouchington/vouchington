import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

test.describe('Rewards Program Statuses Page', () => {
  test('should display statuses list page', async ({ page }) => {
    await navigateTo(page, '/rewards-program-statuses')

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Statuses')
    await expect(page.getByLabel('Search list')).toBeVisible()
  })
})
