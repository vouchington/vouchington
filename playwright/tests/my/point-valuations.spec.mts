import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

test.describe('My Point Valuations', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeEach(async ({ page }) => {
    await navigateTo(page, '/my/rewards-program-point-valuations')
  })

  test('displays page heading', async ({ page }) => {
    await expect(page.getByTestId('point-valuations-heading')).toContainText('Point Valuations')
  })

  test('displays seeded point valuation', async ({ page }) => {
    await expect(
      page
        .getByTestId('point-valuation-program-name')
        .filter({ hasText: 'Chase Ultimate Rewards' }),
    ).toBeVisible()
  })

  test('displays currency-aware value per point', async ({ page }) => {
    await expect(page.getByTestId('point-valuation-cpp-display').first()).toHaveText(
      '$0.02 per point',
    )
  })

  test('add form is always visible without clicking any button', async ({ page }) => {
    await expect(page.getByTestId('point-valuations-manager')).toBeVisible()
    await expect(page.getByTestId('point-valuations-add-form-heading')).toBeVisible()
    await expect(page.getByTestId('point-valuations-add-cpp-label')).toBeVisible()
  })

  test('shows edit button', async ({ page }) => {
    await expect(page.getByTestId('point-valuation-edit-button').first()).toBeVisible()
  })

  test('edit form validates empty value per point', async ({ page }) => {
    await page.getByTestId('point-valuation-edit-button').first().click()
    await page.getByTestId('point-valuation-edit-cpp-input').fill('')
    await page.getByTestId('point-valuation-edit-save-button').click()
    await expect(page.locator('[data-sonner-toast][data-type="error"]')).toContainText(
      'Please enter a valid value per point',
    )
  })

  test('responsive layout on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await navigateTo(page, '/my/rewards-program-point-valuations')
    await expect(page.getByTestId('point-valuations-heading')).toContainText('Point Valuations')
    await expect(
      page
        .getByTestId('point-valuation-program-name')
        .filter({ hasText: 'Chase Ultimate Rewards' }),
    ).toBeVisible()
  })
})
