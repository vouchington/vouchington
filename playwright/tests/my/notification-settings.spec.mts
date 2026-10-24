import { expect, test } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from 'vouchington-tooling/playwright'

test.describe('My Notification Settings', () => {
  test.use({ storageState: AUTH_STATE })

  test('shows email notification settings controls', async ({ page }) => {
    await navigateTo(page, '/my/notification-settings')

    await expect(page).toHaveURL('/my/notification-settings')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Notifications')
    await expect(page.getByTestId('engagement-emails-toggle')).toBeVisible()
    await expect(page.getByTestId('moderation-emails-toggle')).toBeVisible()
    await expect(page.getByTestId('moderation-email-cadence-select')).toBeVisible()
    await expect(page.getByTestId('moderation-email-time-input')).toBeVisible()
    await expect(page.getByTestId('moderation-email-timezone-select')).toBeVisible()
    await expect(page.getByTestId('moderation-email-day-1')).toHaveCount(0)
    await expect(page.getByTestId('moderation-email-day-2')).toHaveCount(0)
    await expect(page.getByTestId('moderation-email-day-3')).toHaveCount(0)
    await expect(page.getByTestId('moderation-email-day-4')).toHaveCount(0)
    await expect(page.getByTestId('moderation-email-day-5')).toHaveCount(0)
    await expect(page.getByTestId('moderation-email-day-6')).toHaveCount(0)
    await expect(page.getByTestId('moderation-email-day-7')).toHaveCount(0)
  })

  test('offers a retry when the settings fail to load', async ({ page }) => {
    await page.route('**/api/v1/my/email-preferences', route => {
      if (route.request().method() !== 'GET') return route.continue()
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Injected failure' }),
      })
    })
    await navigateTo(page, '/my/notification-settings')

    await expect(page.getByTestId('notification-settings-form-retry')).toBeVisible()
  })
})
