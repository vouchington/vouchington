import { expect, test } from '../../helpers/test.mts'
import { resetAnonymousBrowserStateBeforeNavigation } from '../../helpers/browser-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

test.describe('EU copyright navigation with unapproved intake', () => {
  test('blocked EU filing leaves browser history usable and keeps the US form available', async ({
    page,
  }) => {
    await resetAnonymousBrowserStateBeforeNavigation(page)
    await navigateTo(page, '/copyright')
    await expect(
      page.getByRole('link', { name: 'Submit an EU copyright notice', exact: true }),
    ).toHaveCount(0)
    await navigateTo(page, '/copyright/eu-notices/new')
    await expect(page).toHaveURL(/\/copyright\/eu-notices\/new$/)
    await expect(page.getByTestId('copyright-eu-notice-form')).toHaveCount(0)
    await expect(page.getByTestId('copyright-eu-guest-receipt')).toHaveCount(0)
    await page.goBack()
    await expect(page).toHaveURL(/\/copyright$/)
    await page.getByRole('link', { name: 'Submit a copyright notice', exact: true }).click()
    await expect(page).toHaveURL(/\/copyright\/notices\/new$/)
    await expect(page.getByTestId('copyright-notice-form')).toBeVisible()
  })

  test('a complaint navigation cannot expose case controls before sign-in and the login input hydrates', async ({
    page,
  }) => {
    await resetAnonymousBrowserStateBeforeNavigation(page)
    const noticeId = crypto.randomUUID()
    await navigateTo(page, `/copyright/notices/${noticeId}/complaint`)
    await expect(page).toHaveURL(/\/login(?:\?|$)/)
    await expect(page.getByTestId('copyright-eu-complaint-form')).toHaveCount(0)
    await expect(page.getByTestId('copyright-eu-notice-detail')).toHaveCount(0)
    await expect(page.getByTestId('copyright-eu-dispute-settlements')).toHaveCount(0)
    const email = page.getByTestId('login-email-input')
    await expect(email).toBeEditable()
    await email.pressSequentially('copyright-navigation@example.test')
    await expect(email).toHaveValue('copyright-navigation@example.test')
  })
})
