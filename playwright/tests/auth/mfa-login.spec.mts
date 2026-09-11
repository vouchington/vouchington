import { test, expect, type Page } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
const MOCK_LOGIN_ATTEMPT_ID = 'playwright-test-login-attempt-id'

/**
 * Navigate through the login form manually to the MFA step.
 *
 * Route mocks are registered before navigation so they're in place when the
 * form submits. fill() is used instead of pressSequentially() for reliable
 * React controlled-input state updates.
 */
async function navigateToMfaStep(page: Page) {
  // Register mocks before navigation so they're ready when the form submits
  await page.route('**/api/v1/auth/email-address/tokens', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  )
  await page.route('**/api/v1/auth/email-address/login', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ mfa_required: true, login_attempt_id: MOCK_LOGIN_ATTEMPT_ID }),
    }),
  )

  await navigateTo(page, '/login')

  // Email step: fill and submit
  await page.getByTestId('login-email-input').fill('tests@voucha.ai')
  const submitButton = page.getByTestId('login-continue-with-email-button')
  await expect(submitButton).toBeEnabled()
  await submitButton.click()

  // Wait for code step
  await expect(page.getByTestId('login-verification-code-input')).toBeVisible()

  // Code step: enter any 8-char hex code — mock validates nothing
  await page.getByTestId('login-verification-code-input').pressSequentially('ABCD1234')

  // MFA step renders after mock returns mfa_required: true
  await expect(page.getByTestId('mfa-step-container')).toBeVisible()
}

test.describe('MFA login step', () => {
  test('shows MFA step when login returns mfa_required', async ({ page }) => {
    await navigateToMfaStep(page)

    await expect(page.getByTestId('mfa-totp-section')).toBeVisible()
    await expect(page.getByTestId('mfa-passkey-button')).toBeVisible()
    await expect(page.getByTestId('mfa-back-to-login-button')).toBeVisible()
    await expect(page.getByTestId('mfa-totp-input')).toBeFocused()
  })

  test('TOTP verification navigates to home on success', async ({ page }) => {
    await navigateToMfaStep(page)

    await page.route('**/api/v1/auth/mfa/totp/verification', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: { id: 'test-user-id' } }),
      }),
    )

    // Enter 6-digit TOTP code — auto-submits on 6 digits
    const otpInput = page.locator('input[inputmode="numeric"]').first()
    await otpInput.pressSequentially('123456')

    // On success, handleLoginSuccess() does window.location.href = '/'
    await expect(page).toHaveURL('/')
  })

  test('back button from MFA step returns to email step', async ({ page }) => {
    await navigateToMfaStep(page)

    await page.getByTestId('mfa-back-to-login-button').click()

    await expect(page.getByTestId('login-email-input')).toBeVisible()
    await expect(page.getByTestId('login-continue-with-email-button')).toBeVisible()
  })

  test('shows error toast for invalid TOTP code', async ({ page }) => {
    await navigateToMfaStep(page)

    await page.route('**/api/v1/auth/mfa/totp/verification', route =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Invalid verification code' }),
      }),
    )

    const otpInput = page.locator('input[inputmode="numeric"]').first()
    await otpInput.pressSequentially('000000')

    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: 'Invalid verification code' }),
    ).toBeVisible()
  })
})
