import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

test.describe('Rewards Programs Page', () => {
  test('should display rewards programs list page', async ({ page }) => {
    await navigateTo(page, '/rewards-programs')

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Rewards Programs')
    await expect(page.getByLabel('Search list')).toBeVisible()
  })
})
