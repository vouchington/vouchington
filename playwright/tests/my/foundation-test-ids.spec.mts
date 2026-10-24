import { expect, test } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { withCleanUser } from '../../helpers/auth.mts'
import { navigateTo } from 'vouchington-tooling/playwright'
import { invalidate } from '../../../backend/services/entity-cache/invalidate.mts'
import { setUserVerificationFields } from '../../../backend/test-helpers/entities/identity-verification.mts'

const DAY_MS = 24 * 60 * 60 * 1000

test.describe('My foundation test ids', () => {
  test.use({ storageState: AUTH_STATE })

  test('a ready data export exposes its download link', async ({ page }) => {
    const now = Date.now()
    await page.route('**/api/v1/users/*/data-request', route =>
      route.fulfill({
        json: {
          id: 'pw-foundation-export',
          status: 'ready',
          created_at: new Date(now).toISOString(),
          expires_at: new Date(now + 7 * DAY_MS).toISOString(),
          download_url: '/exports/export.zip',
        },
      }),
    )
    await navigateTo(page, '/my/data')
    await expect(page.getByTestId('data-export-download')).toHaveAttribute('download', 'export.zip')
  })

  test('a duplicate government id exposes the contact support link', async ({ page }) => {
    const user = await withCleanUser(page)
    await setUserVerificationFields(user.id, { verificationStatus: 'duplicate_id' })
    await invalidate.users(user.id)
    await navigateTo(page, '/my/identity-verification')
    await expect(page.getByTestId('identity-verification-contact-support')).toHaveAttribute(
      'href',
      'mailto:support@voucha.ai',
    )
  })
})
