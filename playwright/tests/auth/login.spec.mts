import { test, expect } from '../../helpers/test.mts'
import { randomUUID } from 'node:crypto'
import { insertEmailAddressLoginToken } from '../../../backend/test-helpers/entities/email-addresses.mts'
import { createLoginToken } from '../../../backend/services/users/login-token.mts'
import { loginAsTestUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { installTurnstileStub } from '../../helpers/turnstile-stub.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'

test.describe('Login Page', () => {
  test('should render login form', async ({ page }) => {
    await navigateTo(page, '/login')

    await expect(page.getByTestId('login-email-input')).toBeVisible()
    await expect(page.getByTestId('login-turnstile-container')).toBeVisible()
    await expect(page.getByTestId('login-continue-with-email-button')).toBeVisible()
    await expect(page.getByTestId('login-email-input')).toBeFocused()
  })

  test('renders Turnstile on every uncached /login load', async ({ page }) => {
    await installTurnstileStub(page)

    for (let index = 0; index < 3; index += 1) {
      const response = await page.goto('/login', { waitUntil: 'domcontentloaded' })

      expect(response?.status()).toBe(200)
      expect(response?.headers()['x-voucha-cache']).toBe('BYPASS')
      expect(response?.headers()['cache-control'] ?? '').not.toContain('s-maxage')
      await expect(page.getByTestId('login-turnstile-container')).toBeVisible()
      await expect(page.getByTestId('login-continue-with-email-button')).toBeEnabled()
    }
  })

  test('should login with test user credentials', async ({ page }) => {
    await loginAsTestUser(page)

    // Navigate to a lightweight authenticated page to verify the session is usable.
    await navigateTo(page, '/my/preferences')
    await expect(page).toHaveURL(/\/my\/preferences/)

    // Cookies should be set
    const cookies = await page.context().cookies()
    const deviceToken = cookies.find(c => c.name === 'dt')
    const sessionToken = cookies.find(c => c.name === 'st')

    expect(deviceToken).toBeDefined()
    expect(sessionToken).toBeDefined()
  })

  test('should redirect to home if already logged in', async ({ page }) => {
    await loginAsTestUser(page)

    // Try to visit login page again
    await navigateTo(page, '/login')

    // Should redirect to feed
    await expect(page).toHaveURL(/\/feed\/news/)
  })

  test('should transition to code step after submitting email', async ({ page }) => {
    await page.route('**/api/v1/auth/email-address/tokens', route =>
      route.fulfill({ status: 200, body: '{}' }),
    )

    await navigateTo(page, '/login')

    await page.getByTestId('login-email-input').fill('tests+user@voucha.ai')
    const submitButton = page.getByTestId('login-continue-with-email-button')
    await expect(submitButton).toBeEnabled()
    await submitButton.click()

    await expect(page.getByTestId('login-verification-code-input')).toBeVisible()
    await expect(page.getByTestId('login-code-submit-button')).toBeVisible()
    await expect(page.getByTestId('login-code-back-button')).toBeVisible()
    await expect(page.getByTestId('login-verification-code-input')).toBeFocused()

    // OAuth buttons should be hidden during code entry step
    await expect(page.getByTestId('oauth-provider-button-facebook')).toBeHidden()
  })

  test('should log in through the UI with a backend-generated email token', async ({ page }) => {
    const emailAddress = `tests+otp-ui-${Date.now()}-${randomUUID()}@voucha.ai`
    const staleToken = randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()
    const token = createLoginToken()
    expect(token).toMatch(/^[0-9A-F]{8}$/)
    await insertEmailAddressLoginToken(emailAddress, staleToken, true)
    await insertEmailAddressLoginToken(emailAddress, token)

    await page.route('**/api/v1/auth/email-address/tokens', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ email_address: emailAddress }),
      }),
    )

    await navigateTo(page, '/login')

    const emailInput = page.getByTestId('login-email-input')
    await emailInput.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)
    await emailInput.pressSequentially(emailAddress)
    const emailSubmitButton = page.getByTestId('login-continue-with-email-button')
    await expect(emailSubmitButton).toBeEnabled()
    await emailSubmitButton.click()

    const otpInput = page.getByTestId('login-verification-code-input')
    await expect(otpInput).toBeVisible()
    await otpInput.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)
    await otpInput.fill(token)

    await expect(page).toHaveURL(/\/feed\/news/)

    const cookies = await page.context().cookies()
    expect(cookies.find(c => c.name === 'dt')?.value).toBeTruthy()
    expect(cookies.find(c => c.name === 'st')?.value).toBeTruthy()
  })

  test('should show error toast when disposable email is rejected', async ({ page }) => {
    await page.route('**/api/v1/auth/email-address/tokens', route =>
      route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          message:
            'Please use a permanent email address. Disposable email providers are not supported.',
        }),
      }),
    )

    await navigateTo(page, '/login')

    await page.getByTestId('login-email-input').pressSequentially('user@mailinator.com')
    const submitButton = page.getByTestId('login-continue-with-email-button')
    await expect(submitButton).toBeEnabled()
    await submitButton.click()

    await expect(page.locator('[data-sonner-toast]')).toContainText('permanent email')
  })

  test('should go back to email step from code step', async ({ page }) => {
    await page.route('**/api/v1/auth/email-address/tokens', route =>
      route.fulfill({ status: 200, body: '{}' }),
    )

    await navigateTo(page, '/login')
    await page.getByTestId('login-email-input').fill('tests+user@voucha.ai')
    const submitButton = page.getByTestId('login-continue-with-email-button')
    await expect(submitButton).toBeEnabled()
    await submitButton.click()
    await expect(page.getByTestId('login-verification-code-input')).toBeVisible()

    await page.getByTestId('login-code-back-button').click()

    await expect(page.getByTestId('login-email-input')).toBeVisible()
    await expect(page.getByTestId('login-continue-with-email-button')).toBeVisible()
    await expect(page.getByTestId('oauth-provider-button-facebook')).toBeHidden()
    await expect(page.getByTestId('login-email-input')).toBeFocused()
  })

  test('should auto-submit an email login link from query params', async ({ page }) => {
    let resolveLoginRequest!: () => void
    const loginRequestStarted = new Promise<void>(resolve => {
      resolveLoginRequest = resolve
    })

    await page.route('**/api/v1/auth/email-address/login', async route => {
      expect(route.request().postDataJSON()).toMatchObject({
        email_address: 'tests+user@voucha.ai',
        token: 'ABCD1234',
      })

      resolveLoginRequest()

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: { id: 'test-user' } }),
      })
    })

    await installTurnstileStub(page)
    // ast-grep-ignore: playwright-no-raw-goto -- auth login test must avoid navigateTo()'s additional post-navigation waiting so the OTP auto-submit flow can be observed at domcontentloaded
    await page.goto('/login?emailAddress=tests%2Buser%40voucha.ai&otp=abcd1234', {
      waitUntil: 'domcontentloaded',
    })

    await expect(page.getByTestId('login-verification-code-input')).toBeVisible()
    await expect(page.getByTestId('oauth-provider-button-facebook')).toBeHidden()

    await loginRequestStarted

    await expect(page).toHaveURL('/')
  })

  test('should hide Facebook login button until runtime public config enables it', async ({
    page,
  }) => {
    await navigateTo(page, '/login')

    await expect(page.getByTestId('oauth-provider-button-facebook')).toBeHidden()
  })

  test('should logout and clear cookies', async ({ page }) => {
    // Login first and navigate to a lightweight authenticated page to verify the session.
    await loginAsTestUser(page)
    await navigateTo(page, '/my/preferences')
    await expect(page).toHaveURL(/\/my\/preferences/)

    // Verify cookies are set before logout
    const cookiesBeforeLogout = await page.context().cookies()
    const dtBefore = cookiesBeforeLogout.find(c => c.name === 'dt')
    const stBefore = cookiesBeforeLogout.find(c => c.name === 'st')
    expect(dtBefore).toBeDefined()
    expect(stBefore).toBeDefined()
    expect(dtBefore?.value).toBeTruthy()
    expect(stBefore?.value).toBeTruthy()

    // Logout via API call — await the fetch before navigating to avoid abort errors
    await page.evaluate(async () => {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      })
    })
    await navigateTo(page, '/login')

    // Should be on login page
    await expect(page).toHaveURL('/login')

    // The logout API clears the authenticated session. The CF Worker then issues a
    // fresh anonymous session on the next navigation, so st will exist but with a
    // different value (anonymous, not authenticated).
    const cookiesAfterLogout = await page.context().cookies()
    const stAfter = cookiesAfterLogout.find(c => c.name === 'st')
    expect(stAfter).toBeDefined()
    expect(stAfter?.value).toBeTruthy()
    expect(stAfter?.value).not.toBe(stBefore?.value)
  })
})
