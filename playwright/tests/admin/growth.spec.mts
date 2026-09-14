import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'

test.describe('Growth Dashboard', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeEach(async ({ page }) => {
    await navigateTo(page, '/growth')
  })

  test('displays growth dashboard heading', async ({ page }) => {
    await expect(page.getByTestId('growth-dashboard-heading')).toBeVisible()
  })

  test('renders KPI cards', async ({ page }) => {
    const kpiSection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { level: 2 }).filter({ hasText: 'Key Metrics' }) })
    await expect(kpiSection).toBeVisible()
    const cards = kpiSection.getByTestId('kpi-card')
    await expect(cards).toContainText(['Total Users', 'MRR'], { timeout: 10_000 })
  })

  test('date range filter changes URL', async ({ page }) => {
    await waitForBelowFoldHydration(page)
    const combobox = page.locator('[role="combobox"]').first()
    await expect(combobox).toBeVisible()
    await combobox.press(' ')
    const option = page.locator('[role="option"]').filter({ hasText: 'Last 7 days' })
    await option.click()
    await expect(page).toHaveURL(/range=7d/)
  })

  test('shows growth dashboard heading', async ({ page }) => {
    const heading = page.getByRole('heading', { level: 1 }).filter({ hasText: 'Growth Dashboard' })
    await expect(heading).toBeVisible()
  })
})

test.describe('Growth Dashboard - unauthorized', () => {
  test('does not show growth metrics to an unauthenticated user', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, '/growth')
    await expect(page.getByTestId('growth-dashboard-heading')).toHaveCount(0)
    await expect(page.getByTestId('kpi-card')).toHaveCount(0)
  })
})
