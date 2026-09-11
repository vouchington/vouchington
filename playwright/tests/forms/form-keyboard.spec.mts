import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

test.describe('Site-wide form keyboard submit', () => {
  test.use({ storageState: AUTH_STATE })

  test('Enter in the /login email input advances to the verification code step', async ({
    page,
  }) => {
    // /login redirects authenticated users away — clear auth cookies to test the form.
    await page.context().clearCookies()
    await page.route('**/api/v1/auth/email-address/tokens', route =>
      route.fulfill({ status: 200, body: '{}' }),
    )

    await navigateTo(page, '/login')

    const emailInput = page.getByTestId('login-email-input')
    await expect(emailInput).toBeFocused()
    await emailInput.fill('tests+user@voucha.ai')

    const submitButton = page.getByTestId('login-continue-with-email-button')
    await expect(submitButton).toBeEnabled()

    await emailInput.press('Enter')

    // The form's native Enter submission via <Button type='submit'> advances to the
    // verification-code step in the same way as clicking the button.
    await expect(page.getByTestId('login-verification-code-input')).toBeVisible()
  })

  test('Enter in the /communities/create name input submits the form', async ({ page }) => {
    await navigateTo(page, '/communities/create')

    const suffix = Date.now().toString(36)
    const nameInput = page.getByTestId('create-community-name-input')
    await nameInput.pressSequentially(`Form Keyboard Smoke ${suffix}`)

    // Filling the name enables the submit button (>= 3 words, name non-empty).
    const submitButton = page.getByTestId('create-community-submit-button')
    await expect(submitButton).toBeEnabled()

    await nameInput.press('Enter')

    await expect(page).toHaveURL(/\/communities\/form-keyboard-smoke-/)
  })

  test('Plain Enter inserts a newline in the description textarea; Cmd+Enter and Ctrl+Enter submit', async ({
    page,
  }) => {
    await navigateTo(page, '/communities/create')

    const suffix = Date.now().toString(36)
    const nameInput = page.getByTestId('create-community-name-input')
    await nameInput.pressSequentially(`Form Keyboard Textarea ${suffix}`)

    const description = page.getByTestId('create-community-description-textarea')
    await description.click()
    await description.pressSequentially('first line')

    // Plain Enter must insert a newline, not submit the form. We assert this by
    // checking the textarea now has a literal `\n` and that the submit button is
    // still enabled (i.e. no `Creating...` state).
    await description.press('Enter')
    await description.pressSequentially('second line')
    await expect(description).toHaveValue('first line\nsecond line')

    const submitButton = page.getByTestId('create-community-submit-button')
    await expect(submitButton).toBeEnabled()

    await description.press('ControlOrMeta+Enter')
    await expect(page).toHaveURL(/\/communities\/form-keyboard-textarea-/)

    // Reload to retest with Control+Enter on a fresh form (router.push'd after success).
    await navigateTo(page, '/communities/create')
    await page
      .getByTestId('create-community-name-input')
      .pressSequentially(`Form Keyboard Textarea Control ${Date.now().toString(36)}`)
    const description2 = page.getByTestId('create-community-description-textarea')
    await description2.click()
    await description2.pressSequentially('only line')
    await description2.press('Control+Enter')
    await expect(page).toHaveURL(/\/communities\/form-keyboard-textarea-control-/)
  })
})
