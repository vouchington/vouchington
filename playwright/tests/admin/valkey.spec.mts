import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'

test.describe('Valkey Dashboard', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeEach(async ({ page }) => {
    await navigateTo(page, '/admin/valkey', { waitUntil: 'load' })
  })

  test('displays page title', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Valkey')
  })

  test('shows bloom filter rebuild section', async ({ page }) => {
    await expect(page.getByTestId('bloom-filter-rebuild-title')).toBeVisible()
  })

  test('shows rebuild buttons for each filter', async ({ page }) => {
    const filters = ['url-blocklist', 'email-blocklist', 'embedding', 'entity-cache']
    await Promise.all(
      filters.map(async filter => {
        // Find the filter name span, then navigate up to the row div to assert the Rebuild button
        const filterLabel = page.locator('span', { hasText: new RegExp(`^${filter}$`) })
        await expect(filterLabel).toBeVisible()
        const filterRow = filterLabel.locator('..')
        const rebuildBtn = filterRow.locator('button').filter({ hasText: 'Rebuild' })
        await expect(rebuildBtn).toBeVisible()
      }),
    )
  })

  test('has a refresh button', async ({ page }) => {
    const buttons = page.locator('button')
    await expect(buttons.filter({ hasText: 'Refresh' })).toBeVisible()
  })

  test('shows cache management section', async ({ page }) => {
    await expect(page.getByTestId('cache-management-title')).toBeVisible()
  })

  test('shows clear all caches button', async ({ page }) => {
    const buttons = page.locator('button')
    await expect(buttons.filter({ hasText: 'Clear All Caches' })).toBeVisible()
  })

  test('Rebuild button opens confirmation dialog', async ({ page }) => {
    const filterLabel = page.locator('span', { hasText: /^url-blocklist$/ })
    const filterRow = filterLabel.locator('..')
    const rebuildBtn = filterRow.locator('button').filter({ hasText: 'Rebuild' })
    await rebuildBtn.click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
  })

  test('Clear cache group button opens confirmation dialog', async ({ page }) => {
    const clearGroupButton = page
      .locator('button')
      .filter({ hasText: /^Clear$/ })
      .first()
    await clearGroupButton.click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
  })

  test('Clear All Caches button opens confirmation dialog', async ({ page }) => {
    const buttons = page.locator('button')
    await buttons.filter({ hasText: 'Clear All Caches' }).click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
  })

  test('shows flush concerns section', async ({ page }) => {
    await expect(page.getByTestId('flush-concerns-title')).toBeVisible()
  })

  test('shows flush buttons for each concern', async ({ page }) => {
    const concerns = [
      'caches',
      'recently-viewed',
      'blooms',
      'rate-limiter',
      'dynamic-config',
      'sessions',
      'queues',
    ]
    await Promise.all(
      concerns.map(async concern => {
        const concernLabel = page.locator('p', { hasText: new RegExp(`^${concern}$`) })
        await expect(concernLabel).toBeVisible()
        const concernRow = concernLabel.locator('../..')
        const flushBtn = concernRow.locator('button').filter({ hasText: 'Flush' })
        await expect(flushBtn).toBeVisible()
      }),
    )
  })

  test('Flush button opens confirmation dialog', async ({ page }) => {
    const concernLabel = page.locator('p', { hasText: /^caches$/ })
    const concernRow = concernLabel.locator('../..')
    const flushBtn = concernRow.locator('button').filter({ hasText: 'Flush' })
    await flushBtn.click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
  })
})
