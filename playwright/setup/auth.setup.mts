/**
 * Auth setup: drive the real /login UI once per run, save session to storageState.
 *
 * Runs as the 'setup' project (dependency of 'chromium') so it executes after
 * global-setup seeding and webServer boot but before any test. The resulting
 * playwright/.auth/test-user.json is consumed by specs that declare:
 *
 *   test.use({ storageState: AUTH_STATE })
 *
 * Flow:
 *   1. Drive the real /login UI (seeded OTP, mocked send-token, ?next=/my/preferences)
 *      to VERIFY the login flow works end-to-end.
 *   2. Complete a real TOTP challenge for the seeded administrator and inject
 *      that session's cookies, which survive across test contexts without a
 *      live CF Worker KV session lookup.
 *   3. Save the verified session for shared and explicit admin test contexts.
 */
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { test, expect } from '../helpers/test.mts'
import { TEST_USER_EMAIL, TEST_USER_ID } from '../../integration-tests/web/helpers/constants.mts'
import { createLoginToken } from '../../backend/services/users/login-token.mts'
import { insertEmailAddressLoginToken } from '../../backend/test-helpers/entities/email-addresses.mts'
import { createVerifiedMfaTestSession } from '../../backend/test-helpers/authenticated-session.mts'
import { navigateTo, waitForBelowFoldHydration } from 'vouchington-tooling/playwright'
import { ADMIN_AUTH_STATE, AUTH_STATE } from '../helpers/auth-state.mts'

test('authenticate seeded administrator through login and verified TOTP', async ({ page }) => {
  // ── Step 1: Verify the real /login UI works ──────────────────────────────
  const token = createLoginToken()
  await insertEmailAddressLoginToken(TEST_USER_EMAIL, token)

  // Stub the send-token endpoint so no real email is dispatched.
  await page.route('**/api/v1/auth/email-address/tokens', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ email_address: TEST_USER_EMAIL }),
    }),
  )

  // navigateTo installs the Turnstile stub so the widget fires immediately.
  await navigateTo(page, `/login?next=/my/preferences`)

  const emailInput = page.getByTestId('login-email-input')
  await emailInput.scrollIntoViewIfNeeded()
  await waitForBelowFoldHydration(page)
  await emailInput.pressSequentially(TEST_USER_EMAIL)

  const emailSubmitButton = page.getByTestId('login-continue-with-email-button')
  await expect(emailSubmitButton).toBeEnabled()
  await emailSubmitButton.click()

  const otpInput = page.getByTestId('login-verification-code-input')
  await expect(otpInput).toBeVisible()
  await otpInput.scrollIntoViewIfNeeded()
  await waitForBelowFoldHydration(page)
  await otpInput.pressSequentially(token)
  await page.getByTestId('login-code-submit-button').click()

  // Assert login worked: the ?next= redirect sent us to the preferences page.
  await expect(page).toHaveURL(/\/my\/preferences/)

  // ── Step 2: Inject verified cookie-based auth for reliable storageState ──
  // The CF Worker stores session state server-side (KV), so the browser cookies
  // after a real login are still the anonymous ones created on page load. Cookie
  // injection works across fresh test contexts without a live KV lookup.
  // The seeded account has administrator role, so require an actual completed
  // factor before saving this shared fixture.
  const { deviceToken, sessionToken } = await createVerifiedMfaTestSession(TEST_USER_ID, {
    user_agent: await page.evaluate(() => navigator.userAgent),
  })
  expect(sessionToken.payload.mfa_at).toEqual(expect.any(Number))
  expect(deviceToken.payload.mfa_at).toBe(sessionToken.payload.mfa_at)
  expect(sessionToken.payload.rol).toContain('administrator')
  const origin = new URL(page.url()).origin
  await page.context().addCookies([
    { name: 'dt', value: deviceToken.token, url: origin, httpOnly: true, sameSite: 'Lax' },
    { name: 'st', value: sessionToken.token, url: origin, httpOnly: true, sameSite: 'Lax' },
  ])

  // Fail fast if cookie injection didn't take — otherwise this setup would
  // persist an unauthenticated storageState and every dependent spec would fail.
  const cookies = await page.context().cookies()
  expect(cookies.find(c => c.name === 'dt')?.value).toBe(deviceToken.token)
  expect(cookies.find(c => c.name === 'st')?.value).toBe(sessionToken.token)

  // ── Step 3: Persist the authenticated administrator session ──────────────
  mkdirSync(dirname(AUTH_STATE), { recursive: true })
  await page.context().storageState({ path: AUTH_STATE })
  mkdirSync(dirname(ADMIN_AUTH_STATE), { recursive: true })
  await page.context().storageState({ path: ADMIN_AUTH_STATE })
})
