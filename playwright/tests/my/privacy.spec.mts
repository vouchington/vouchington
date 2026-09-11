import { test, expect, type Page } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { withCleanUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { updateUserFields } from '../../../backend/services/users/update-fields.mts'

async function choosePrivacyOption(page: Page, field: string, option: string) {
  await page.getByTestId(field).click()
  await page.getByTestId(option).click()
}

test.describe('My Privacy', () => {
  test.use({ storageState: AUTH_STATE })

  test('displays page heading', async ({ page }) => {
    await navigateTo(page, '/my/privacy')

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Privacy')
  })

  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, '/my/privacy')
    await expect(page).toHaveURL('/login')
  })

  test('updates privacy visibility, post defaults, and consent controls', async ({ page }) => {
    const user = await withCleanUser(page)
    await updateUserFields(user.id, {
      follows_visibility: 'everyone',
      default_post_broadcast: 'everyone',
      default_post_privacy: 'public',
      processing_restricted_at: false,
      third_party_marketing: false,
    })

    await navigateTo(page, '/my/privacy')

    await choosePrivacyOption(page, 'follows-visibility-select', 'follows-visibility-option-nobody')
    await expect(page.getByTestId('follows-visibility-select')).toContainText('Nobody')

    await choosePrivacyOption(
      page,
      'default-post-broadcast-select',
      'default-post-broadcast-option-followers',
    )
    await expect(page.getByTestId('default-post-broadcast-select')).toContainText('Followers')

    await choosePrivacyOption(
      page,
      'default-post-privacy-select',
      'default-post-privacy-option-private',
    )
    await expect(page.getByTestId('default-post-privacy-select')).toContainText('Private')

    await page.getByTestId('third-party-marketing-toggle').click()
    await expect(page.getByTestId('third-party-marketing-toggle')).toHaveAttribute(
      'data-state',
      'checked',
    )

    await page.getByTestId('processing-restricted-toggle').click()
    await expect(page.getByTestId('processing-restricted-toggle')).toHaveAttribute(
      'data-state',
      'checked',
    )
  })
})
