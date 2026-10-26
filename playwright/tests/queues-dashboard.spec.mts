import { test, expect } from '../helpers/test.mts'
import { AUTH_STATE } from '../helpers/auth-state.mts'
import { navigateTo } from 'vouchington-tooling/playwright'

test.describe('Queue Dashboard', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeEach(async ({ page }) => {
    await navigateTo(page, '/admin/queues')
  })

  test('page loads and shows Queues heading', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Queues')
  })

  test('opens the GlideMQ Dashboard after browser renewal', async ({ page }) => {
    const link = page.getByTestId('glidemq-dashboard-link')
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', '/session-renewal?next=%2Fadmin%2Fmq-dashboard')
  })
})
