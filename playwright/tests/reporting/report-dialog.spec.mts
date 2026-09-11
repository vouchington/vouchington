import { expect, test } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

test.describe('Report dialog', () => {
  test.use({ storageState: AUTH_STATE })

  test('opens report dialog with reason radios and submit button on user profile', async ({
    page,
  }) => {
    // Navigate to another user's profile (not our own) so the Report button is visible
    await navigateTo(page, '/user/blocked-friend')

    // The Report inline button is rendered in the user aside — wait for it (dynamic import)
    const reportButton = page.getByTestId('report-inline-button').first()
    await expect(reportButton).toBeVisible({ timeout: 10_000 })
    await reportButton.click()

    // Verify report dialog appears
    const dialog = page.getByTestId('report-dialog')
    await expect(dialog).toBeVisible()

    // Verify all reason radio buttons are rendered
    const spamRadio = page.getByTestId('report-reason-spam')
    await expect(spamRadio).toBeVisible()
    await expect(page.getByTestId('report-reason-harassment')).toBeVisible()
    await expect(page.getByTestId('report-reason-misinformation')).toBeVisible()
    await expect(page.getByTestId('report-reason-illegal-content')).toBeVisible()
    await expect(page.getByTestId('report-reason-other')).toBeVisible()
    await spamRadio.click()

    // Verify submit button is visible and enabled after selecting a reason
    const submitButton = page.getByTestId('report-submit')
    await expect(submitButton).toBeVisible()
    await expect(submitButton).toBeEnabled()

    // Cancel without submitting to avoid polluting the DB
    await page.getByTestId('report-cancel').click()
    await expect(dialog).toBeHidden()
  })
})
