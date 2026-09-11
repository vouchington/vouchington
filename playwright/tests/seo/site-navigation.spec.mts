import { expect, test } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { TEST_USER_USERNAME } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

test.describe('Site navigation structured data', () => {
  test.use({ storageState: AUTH_STATE })

  test('suppresses all JSON-LD on plans for authenticated viewers', async ({ page }) => {
    await navigateTo(page, '/plans')

    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0)
  })

  test('suppresses public profile JSON-LD for authenticated viewers', async ({ page }) => {
    await navigateTo(page, `/user/${TEST_USER_USERNAME}`)

    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0)
  })
})
