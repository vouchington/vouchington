import { test, expect } from '../../helpers/test.mts'
import { withCleanUser } from '../../helpers/auth.mts'
import { insertTestAmexReferralProgram } from '../../helpers/insert-test-referral-program.mts'
import { navigateTo, randomSuffix } from 'vouchington-tooling/playwright'
import { createTestReferralProgramLink } from '../../../backend/test-helpers/entities/landing-pages.mts'

test.describe('My Referral Links test ids', () => {
  test('link action controls', async ({ page }) => {
    const user = await withCleanUser(page)
    const program = await insertTestAmexReferralProgram()
    await createTestReferralProgramLink({
      userId: user.id,
      referralProgramId: program.topicId,
      url: `https://americanexpress.com/en-us/referral/pw-${randomSuffix()}`,
      label: 'Playwright Amex link',
    })
    await navigateTo(page, '/my/referral-links')

    await expect(page.getByTestId('referral-link-actions-edit-label')).toBeVisible()
    await expect(page.getByTestId('referral-link-actions-deactivate')).toBeVisible()
    await expect(page.getByTestId('referral-link-actions-unfurl')).toBeVisible()

    await page.getByTestId('referral-link-actions-delete').click()
    await expect(page.getByTestId('referral-link-actions-confirm')).toBeVisible()
    await expect(page.getByTestId('referral-link-actions-cancel')).toBeVisible()
    await page.getByTestId('referral-link-actions-cancel').click()

    await page.getByTestId('referral-link-actions-edit-label').click()
    await expect(page.getByTestId('referral-link-groups-save')).toBeVisible()
    await expect(page.getByTestId('referral-link-groups-cancel')).toBeVisible()
  })
})
