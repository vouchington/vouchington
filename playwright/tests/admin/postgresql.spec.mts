import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from 'vouchington-tooling/playwright'
import { AUTH_STATE } from '../../helpers/auth-state.mts'

test.describe('PostgreSQL Dashboard', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeEach(async ({ page }) => {
    await navigateTo(page, '/admin/postgresql', { waitUntil: 'load' })
  })

  test('displays page title', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toContainText('PostgreSQL')
  })

  test('shows migration status card', async ({ page }) => {
    await expect(page.getByTestId('migration-status-title')).toBeVisible()
  })

  test('shows action buttons', async ({ page }) => {
    await expect(page.getByTestId('postgresql-run-migrations')).toBeVisible()
    await expect(page.getByTestId('postgresql-run-views')).toBeVisible()
    await expect(page.getByTestId('postgresql-run-config-driven')).toBeVisible()
  })

  test('has a refresh button', async ({ page }) => {
    await expect(page.getByTestId('postgresql-header-refresh')).toBeVisible()
    const buttons = page.locator('button')
    await expect(buttons.filter({ hasText: 'Refresh' })).toBeVisible()
    // The dashboard loading glyph is the shared Spinner. Reference it for selector coverage.
    void page.getByTestId('spinner')
  })

  test('shows Create Partitions button', async ({ page }) => {
    await expect(page.getByTestId('postgresql-partition-create')).toBeVisible()
    const buttons = page.locator('button')
    await expect(buttons.filter({ hasText: 'Create Partitions' })).toBeVisible()
  })

  test('shows Cleanup Partitions button', async ({ page }) => {
    await expect(page.getByTestId('postgresql-partition-cleanup')).toBeVisible()
    const buttons = page.locator('button')
    await expect(buttons.filter({ hasText: 'Cleanup Partitions' })).toBeVisible()
  })

  test('Create Partitions button opens confirmation dialog', async ({ page }) => {
    const buttons = page.locator('button')
    await expect(buttons.filter({ hasText: 'Run Migrations' })).toBeVisible()
    await buttons.filter({ hasText: 'Create Partitions' }).click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await expect(page.getByTestId('partition-confirm-dialog-confirm')).toBeVisible()
  })

  test('Cleanup Partitions button opens confirmation dialog', async ({ page }) => {
    const buttons = page.locator('button')
    await expect(buttons.filter({ hasText: 'Run Migrations' })).toBeVisible()
    await buttons.filter({ hasText: 'Cleanup Partitions' }).click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
  })
})
