import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { setFeatureFlags } from '../../helpers/feature-flags.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { TEST_PNG } from '../../helpers/test-fixtures.mts'
import { TEST_USER_ID } from '../../../integration-tests/web/helpers/constants.mts'
import { insertTestUserSession } from '../../../backend/test-helpers/entities/user-sessions.mts'
import { createTestUserDirect } from '../../../backend/test-helpers/entities/users-direct.mts'
import { insertTestBlueskyLinkedAccount } from '../../../backend/test-helpers/entities/bluesky-linked-accounts.mts'
import { requireTestValue } from '../../helpers/assertions.mts'

test.describe('My Identity Page', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeEach(async ({ page }) => {
    await page.route(
      url => new URL(url.toString()).pathname.startsWith('/images/'),
      route => route.fulfill({ body: TEST_PNG, contentType: 'image/png', status: 200 }),
    )
    await navigateTo(page, '/my/identity')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Identity')
  })

  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, '/my/identity')
    await expect(page).toHaveURL('/login')
  })

  test('displays identity page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Identity')
  })

  test('displays username section with input', async ({ page }) => {
    await expect(page.getByTestId('identity-username-heading')).toBeVisible()
    await expect(page.getByTestId('identity-username-input')).toBeVisible()
    await expect(page.getByTestId('identity-username-input')).toHaveValue('tests')
  })

  test('displays save username button', async ({ page }) => {
    await expect(page.getByTestId('identity-save-username-button')).toBeVisible()
  })

  test('save username button is disabled when username unchanged', async ({ page }) => {
    await expect(page.getByTestId('identity-save-username-button')).toBeDisabled()
  })

  test('save username button is enabled when username is changed', async ({ page }) => {
    await page.getByTestId('identity-username-input').fill('tests-changed')
    await expect(page.getByTestId('identity-save-username-button')).toBeEnabled()
  })

  test('displays profile image section', async ({ page }) => {
    await expect(page.getByTestId('identity-profile-image-heading')).toBeVisible()
  })

  test('displays facebook section', async ({ page }) => {
    // Use toBeAttached: the heading is in the DOM but may be hidden if the Facebook SDK
    // is unavailable in the test environment (OAuthConnection uses hidden attr, not null)
    await expect(page.getByTestId('oauth-connection-facebook-heading')).toBeAttached()
  })

  test('displays display name source section', async ({ page }) => {
    await expect(page.getByTestId('identity-display-name-source-heading')).toBeVisible()
    await expect(page.getByTestId('identity-display-name-source-trigger')).toBeVisible()
  })

  test('facebook option in display name source is disabled when no Facebook account connected', async ({
    page,
  }) => {
    // Open the select to reveal options
    await page.getByTestId('identity-display-name-source-trigger').click()
    await expect(page.getByTestId('identity-display-name-source-option-facebook')).toBeDisabled()
  })

  test('displays MFA status banner', async ({ page }) => {
    await expect(page.getByTestId('mfa-status-banner')).toBeVisible()
    await expect(page.getByTestId('mfa-status-badge')).toBeVisible()
  })

  test('displays and revokes active sessions', async ({ page }) => {
    const extraSession = await insertTestUserSession({
      userId: TEST_USER_ID,
      deviceName: 'Playwright extra device',
      userAgent: 'Playwright/active-sessions',
    })

    await navigateTo(page, '/my/identity')

    const manager = page.getByTestId('active-sessions-manager')
    await expect(manager).toBeVisible()
    await expect(page.getByTestId('active-sessions-sign-out-all-button')).toBeVisible()

    const sessionRow = page.getByTestId(`active-session-item-${extraSession.id}`)
    await expect(sessionRow).toContainText('Playwright extra device')

    await sessionRow.getByTestId('active-session-sign-out-button').click()
    await page.getByRole('button', { name: 'Sign out session' }).click()
    await expect(page.locator('[data-sonner-toast][data-type="success"]')).toContainText(
      'Session signed out',
    )
    await expect(sessionRow).toBeHidden()
  })
})

test.describe('My Identity Page — Bluesky connection (disconnected)', () => {
  test.use({ storageState: AUTH_STATE })

  test('shows the handle input and a disabled connect button when no Bluesky account is linked', async ({
    page,
  }) => {
    await setFeatureFlags(page, { fediverse: true })
    await navigateTo(page, '/my/identity')

    await expect(page.getByTestId('bluesky-connection-heading')).toBeVisible()
    await expect(page.getByTestId('bluesky-connection-handle-input')).toBeVisible()
    await expect(page.getByTestId('bluesky-connection-connect-button')).toBeDisabled()
  })
})

test.describe('My Identity Page — Bluesky connection (linked)', () => {
  test('shows the linked handle and disconnect button when a Bluesky account is linked', async ({
    page,
  }) => {
    const user = requireTestValue(await createTestUserDirect(), 'Failed to create test user')
    const linkedHandle = 'playwright-linked.bsky.social'
    await insertTestBlueskyLinkedAccount({ userId: user.id, handle: linkedHandle })

    await loginAsUser(page, user.id)
    await setFeatureFlags(page, { fediverse: true })
    await navigateTo(page, '/my/identity')

    await expect(page.getByTestId('bluesky-connection-disconnect-button')).toBeVisible()
    await expect(page.getByTestId('bluesky-connection-handle')).toContainText(linkedHandle)
    await expect(page.getByTestId('bluesky-connection-handle-input')).toHaveCount(0)
  })
})
