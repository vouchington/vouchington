import { navigateTo } from '../../helpers/navigate-to.mts'
import { expect, test } from '../../helpers/test.mts'

test.describe('Breadcrumb visuals', () => {
  test('topic list page shows visible breadcrumbs', async ({ page }) => {
    await navigateTo(page, '/cards')

    const nav = page.locator('nav[aria-label="breadcrumb"]')
    await expect(nav).toBeVisible()
    await expect(nav.locator('a').first()).toContainText('Home')
  })
})
