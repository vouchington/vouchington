import { test, expect } from '../helpers/test.mts'
import { AUTH_STATE } from '../helpers/auth-state.mts'
import { navigateTo } from '../helpers/navigate-to.mts'

test.describe('Queue Dashboard', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeEach(async ({ page }) => {
    await navigateTo(page, '/admin/queues')
  })

  test('page loads and shows Queues heading', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Queues')
  })

  test('shows Open GlideMQ Dashboard link pointing to /admin/mq-dashboard', async ({ page }) => {
    const link = page.getByTestId('glidemq-dashboard-link')
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', '/admin/mq-dashboard')
  })
})
