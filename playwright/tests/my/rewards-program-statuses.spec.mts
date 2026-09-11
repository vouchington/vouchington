import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

test.describe('My Rewards Program Statuses', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeEach(async ({ page }) => {
    await navigateTo(page, '/my/rewards-program-statuses')
  })

  test('displays page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Rewards Program Statuses')
  })

  test('displays seeded status', async ({ page }) => {
    await expect(page.getByTestId('rewards-status-name')).toContainText(
      'Chase Sapphire Preferred Status',
    )
  })

  test('add form is always visible without clicking any button', async ({ page }) => {
    await expect(page.getByTestId('rewards-program-statuses-manager')).toBeVisible()
    await expect(page.getByTestId('rewards-status-add-heading')).toBeVisible()
  })

  test('shows edit button', async ({ page }) => {
    await expect(page.getByTestId('rewards-status-edit-button')).toBeVisible()
  })

  test('shows date fields when editing', async ({ page }) => {
    await page.getByTestId('rewards-status-edit-button').click()
    await expect(page.getByTestId('rewards-status-since-label')).toBeVisible()
    await expect(page.getByTestId('rewards-status-until-label')).toBeVisible()
  })

  test('responsive layout on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await navigateTo(page, '/my/rewards-program-statuses')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Rewards Program Statuses')
    await expect(page.getByTestId('rewards-status-name')).toContainText(
      'Chase Sapphire Preferred Status',
    )
  })
})
