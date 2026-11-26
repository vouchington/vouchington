import {
  test,
  expect,
  withMonitoredPage,
  protectPlaywrightHookTimeouts,
} from '../../helpers/test.mts'
import { apiRequest } from '../../helpers/api-request.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { loginAsTestUser } from '../../helpers/auth.mts'
import { navigateTo, randomSuffix } from 'vouchington-tooling/playwright'

/**
 * Community join/leave flow tests.
 * Creates a public community and verifies the Join and Leave buttons work.
 */

let COMMUNITY_SLUG = ''
let COMMUNITY_NAME = ''

const createCommunityFixture = () => {
  const suffix = randomSuffix()
  return {
    slug: `pw-join-playwright-${suffix}`,
    name: `PW Join Playwright ${suffix}`,
  }
}

test.describe('Community Join/Leave', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeAll(async ({ browser }, testInfo) => {
    protectPlaywrightHookTimeouts(test.info())
    const fixture = createCommunityFixture()
    COMMUNITY_NAME = fixture.name
    COMMUNITY_SLUG = fixture.slug

    await withMonitoredPage(browser, testInfo, async page => {
      await loginAsTestUser(page)
      // Create a second community owned by the test user
      // The test user will already be a member (owner), so we test a different scenario
      const res = await apiRequest(page, 'POST', '/api/v1/communities', {
        name: COMMUNITY_NAME,
        slug: COMMUNITY_SLUG,
      })
      if (!res.ok() && res.status() !== 409)
        throw new Error(`Failed to create community: ${res.status()}`)
      // Owner leaves so they can re-join as a regular member; ignore failure because
      // owners may not be able to leave.
      await apiRequest(page, 'DELETE', `/api/v1/communities/${COMMUNITY_SLUG}/members`)
    })
  })

  test.describe('anonymous', () => {
    // Clear auth cookies (not storageState) so the inherited cookie-consent
    // localStorage stays set and the consent banner doesn't reappear.
    test.beforeEach(async ({ page }) => {
      await page.context().clearCookies()
    })

    test('logged-out user does not see Join button', async ({ page }) => {
      await navigateTo(page, `/communities/${COMMUNITY_SLUG}`)
      // The JoinButton returns null when currentUser is null
      await expect(page.getByTestId('community-join-button')).toBeHidden()
    })

    test('unauthenticated user is redirected from settings to login', async ({ page }) => {
      await navigateTo(page, `/communities/${COMMUNITY_SLUG}/settings`)
      await expect(page).toHaveURL('/login')
    })
  })

  test('Settings tab visible for owner', async ({ page }) => {
    await navigateTo(page, `/communities/${COMMUNITY_SLUG}`)
    // The owner sees the Settings tab in community nav
    await expect(page.getByTestId('community-nav-settings')).toBeVisible()
  })

  test('settings page is accessible to owner', async ({ page }) => {
    await navigateTo(page, `/communities/${COMMUNITY_SLUG}/settings`)
    await expect(page.getByTestId('community-settings-heading')).toBeVisible()
  })
})
