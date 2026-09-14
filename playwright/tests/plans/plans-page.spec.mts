import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

test.describe('Plans page visuals', () => {
  test('omits breadcrumbs', async ({ page }) => {
    await navigateTo(page, '/plans')

    const nav = page.locator('nav[aria-label="breadcrumb"]')
    await expect(nav).toHaveCount(0)
    await expect(page.getByTestId('breadcrumb-link-home')).toHaveCount(0)
    await expect(page.getByTestId('breadcrumb-current-plans')).toHaveCount(0)
  })

  test('shows feature comparison table with all plan columns', async ({ page }) => {
    await navigateTo(page, '/plans')

    await expect(page.getByTestId('plan-comparison-heading')).toBeVisible()
    await expect(page.getByTestId('free-plan-get-started-link')).toHaveAttribute('href', '/login')

    const table = page.getByTestId('plan-comparison-table')
    await expect(table).toBeVisible()

    // All three plan columns are present
    await expect(page.getByTestId('plan-comparison-column-free')).toBeVisible()
    await expect(page.getByTestId('plan-comparison-column-plus')).toBeVisible()
    await expect(page.getByTestId('plan-comparison-column-pro')).toBeVisible()

    const catalogRows = page.getByTestId('plan-comparison-row')
    await expect(catalogRows.filter({ hasText: 'Contribution capacity' })).toContainText('More')
    await expect(catalogRows.filter({ hasText: 'Automatic post topics' })).toContainText('Most')
  })

  test('shows FAQ section with questions', async ({ page }) => {
    await navigateTo(page, '/plans')

    await expect(page.getByTestId('plan-faq-heading')).toBeVisible()
  })
})
