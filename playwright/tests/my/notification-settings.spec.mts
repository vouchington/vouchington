import { expect, test } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

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
})
