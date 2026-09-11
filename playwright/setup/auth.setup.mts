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
 *   2. Inject authenticated cookies via createDeviceAndSessionTokens — the same
 *      approach as the loginAsUser helper — so the storageState has tokens that
 *      embed the user ID in the JWT and survive across test contexts without
 *      needing a live CF Worker KV session lookup.
 *   3. Save the context to playwright/.auth/test-user.json.
 */
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { test, expect } from '../helpers/test.mts'
import { TEST_USER_EMAIL, TEST_USER_ID } from '../../integration-tests/web/helpers/constants.mts'
import { createLoginToken } from '../../backend/services/users/login-token.mts'
import { insertEmailAddressLoginToken } from '../../backend/test-helpers/entities/email-addresses.mts'
import { createDeviceAndSessionTokens } from '../../backend/services/jwt-session/index.mts'
import { mintUUIDv7 } from '../../ts-shared/session-jwt/index.mts'
import { navigateTo } from '../helpers/navigate-to.mts'
import { waitForBelowFoldHydration } from '../helpers/wait-for-hydration.mts'
import { AUTH_STATE } from '../helpers/auth-state.mts'

test('authenticate as test user via real /login flow', async ({ page }) => {
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

  // Assert login worked: the ?next= redirect sent us to the preferences page.
  await expect(page).toHaveURL(/\/my\/preferences/)

  // ── Step 2: Inject cookie-based auth for reliable storageState ───────────
  // The CF Worker stores session state server-side (KV), so the browser cookies
  // after a real login are still the anonymous ones created on page load. Cookie
  // injection (as in loginAsUser) embeds uid directly in the JWT and works across
  // fresh test contexts without a live KV lookup.
  const did = mintUUIDv7()
  const { deviceToken, sessionToken } = await createDeviceAndSessionTokens({
    did,
    uid: TEST_USER_ID,
  })
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

  // ── Step 3: Persist the authenticated session ────────────────────────────
  mkdirSync(dirname(AUTH_STATE), { recursive: true })
  await page.context().storageState({ path: AUTH_STATE })
})
