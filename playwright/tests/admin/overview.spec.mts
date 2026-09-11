import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'

test.describe('Admin redirect', () => {
  test.use({ storageState: AUTH_STATE })

  test('redirects /admin to /urls', async ({ page }) => {
    await navigateTo(page, '/admin')
    await page.waitForURL('/urls')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('redirects /admin/dashboard to /urls', async ({ page }) => {
    await navigateTo(page, '/admin/dashboard')
    await page.waitForURL('/urls')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })
})

test.describe('PostgreSQL page — Sync Articles', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeEach(async ({ page }) => {
    await navigateTo(page, '/admin/postgresql', { waitUntil: 'load' })
  })

  test('shows Sync Articles section', async ({ page }) => {
    await expect(page.getByTestId('sync-articles-button')).toBeVisible()
  })
})
