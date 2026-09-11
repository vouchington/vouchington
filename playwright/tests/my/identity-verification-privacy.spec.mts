import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { TEST_USER_ID } from '../../../integration-tests/web/helpers/constants.mts'
import { invalidate } from '../../../backend/services/entity-cache/invalidate.mts'
import { setUserVerificationFields } from '../../../backend/test-helpers/entities/identity-verification.mts'

test.describe('My Identity Verification Privacy', () => {
  test.use({ storageState: AUTH_STATE })

  test('lets verified users control public verified display preferences', async ({ page }) => {
    await setUserVerificationFields(TEST_USER_ID, {
      verificationStatus: 'verified',
      verifiedBadgeVisible: true,
      publicVerifiedNameDisplay: 'hidden',
      verifiedFirstName: 'Test',
      verifiedLastNameInitial: 'U',
      verifiedFullName: 'Test User',
    })
    await invalidate.users(TEST_USER_ID)

    await navigateTo(page, '/my/identity-verification')

    await expect(page.getByTestId('badge-visible-toggle')).toBeVisible()
    await page.getByTestId('name-display-select').click()
    await page.getByTestId('name-display-option-first-name-last-initial').click()
    await page.getByTestId('badge-visible-toggle').click()
    await page.getByTestId('save-preferences-button').click()

    await expect(page.getByTestId('identity-display-preferences-success')).toBeVisible()
  })
})
