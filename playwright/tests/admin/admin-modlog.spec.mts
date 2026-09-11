import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

test.use({ storageState: AUTH_STATE })

test.describe('admin modlog', () => {
  test('admin can view modlog page heading', async ({ page }) => {
    await navigateTo(page, '/admin/modlog')

    await expect(page.getByTestId('admin-modlog-heading')).toBeVisible()
  })

  test('admin modlog page renders table', async ({ page }) => {
    await navigateTo(page, '/admin/modlog')

    // The page should load without error and show the heading
    await expect(page.getByTestId('admin-modlog-heading')).toBeVisible()

    // Either rows exist or the empty cell is present
    const rowsVisible = await page
      .getByTestId('admin-modlog-row')
      .first()
      .isVisible()
      .catch(() => false)
    const emptyVisible = await page
      .locator('td:has-text("No moderation actions found")')
      .isVisible()
      .catch(() => false)
    expect(rowsVisible || emptyVisible).toBe(true)
  })
})
