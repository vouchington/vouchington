/**
 * Discoverable passkey sign-in UI tests.
 *
 * These tests use route mocks for the backend endpoints and stub `navigator.credentials.get`
 * because Chrome's CDP virtual authenticator does not support the headless discoverable
 * (empty allowCredentials) credential-selection flow — the OS picker that normally appears
 * cannot be automated without real passkey hardware or platform authenticator support in
 * headless mode.
 *
 * The WebAuthn backend flows are covered by backend service and route unit tests. These specs
 * verify the login-form UI behavior: button visibility, success navigation, and error paths.
 */
import { test, expect, type Page } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

const FAKE_OPTIONS = {
  challenge: 'dGVzdC1jaGFsbGVuZ2U',
  timeout: 60_000,
  rpId: 'localhost',
  allowCredentials: [],
  userVerification: 'required',
}

const FAKE_AUTH_RESPONSE = {
  id: 'fake-passkey-credential-id',
  rawId: 'fake-passkey-credential-id',
  type: 'public-key',
  response: {
    authenticatorData: '',
    clientDataJSON: '',
    signature: '',
    userHandle: null,
  },
  clientExtensionResults: {},
}

/** Install a page-level stub for navigator.credentials.get that resolves immediately. */
async function stubWebAuthnSuccess(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'credentials', {
      value: {
        get: () =>
          Promise.resolve({
            id: 'fake-passkey-credential-id',
            rawId: new Uint8Array([1, 2, 3]).buffer,
            type: 'public-key',
            response: {
              authenticatorData: new Uint8Array([]),
              clientDataJSON: new Uint8Array([]),
              signature: new Uint8Array([]),
              userHandle: null,
              getTransports: () => ['internal'],
            },
            getClientExtensionResults: () => ({}),
            authenticatorAttachment: 'platform',
          }),
        create: () => Promise.reject(new Error('Unexpected create call')),
      },
      configurable: true,
    })
  })
}

/** Install a page-level stub for navigator.credentials.get that rejects with NotAllowedError. */
async function stubWebAuthnCancelled(page: Page) {
  await page.addInitScript(() => {
    const error = new DOMException(
      'The operation either timed out or was not allowed.',
      'NotAllowedError',
    )
    Object.defineProperty(navigator, 'credentials', {
      value: {
        get: () => Promise.reject(error),
        create: () => Promise.reject(new Error('Unexpected create call')),
      },
      configurable: true,
    })
  })
}

test.describe('Discoverable passkey sign-in', () => {
  test('renders Sign in with a passkey button on the login page', async ({ page }) => {
    await navigateTo(page, '/login')
    await expect(page.getByTestId('login-passkey-button')).toBeVisible()
  })

  test('navigates to home after successful passkey sign-in', async ({ page }) => {
    await stubWebAuthnSuccess(page)

    await page.route('**/api/v1/auth/passkeys/authentication/options', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ options: FAKE_OPTIONS }),
      }),
    )

    await page.route('**/api/v1/auth/passkeys/authentication/verify', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id: 'test-user-id' },
          ...FAKE_AUTH_RESPONSE,
        }),
      }),
    )

    await navigateTo(page, '/login')
    await expect(page.getByTestId('login-passkey-button')).toBeVisible()
    await page.getByTestId('login-passkey-button').click()

    await expect(page).toHaveURL('/', { timeout: 10_000 })
  })

  test('stays on login page when passkey sign-in is cancelled', async ({ page }) => {
    await stubWebAuthnCancelled(page)

    await page.route('**/api/v1/auth/passkeys/authentication/options', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ options: FAKE_OPTIONS }),
      }),
    )

    await navigateTo(page, '/login')
    await expect(page.getByTestId('login-passkey-button')).toBeVisible()
    await page.getByTestId('login-passkey-button').click()

    // Should remain on /login after cancellation
    await page.waitForURL('/login', { timeout: 5000 })
    await expect(page.getByTestId('login-passkey-button')).toBeVisible()
  })

  test('stays on login page when no account is registered for the passkey (401)', async ({
    page,
  }) => {
    await stubWebAuthnSuccess(page)

    await page.route('**/api/v1/auth/passkeys/authentication/options', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ options: FAKE_OPTIONS }),
      }),
    )

    await page.route('**/api/v1/auth/passkeys/authentication/verify', route =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Passkey sign-in failed' }),
      }),
    )

    await navigateTo(page, '/login')
    await page.getByTestId('login-passkey-button').click()

    // Should remain on /login
    await page.waitForURL('/login', { timeout: 5000 })
    await expect(page.getByTestId('login-passkey-button')).toBeVisible()
  })
})
