import { test, expect, withMonitoredPage } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { loginAsTestUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'
import { randomSuffix } from '../../helpers/random-id.mts'

/**
 * Explore Communities page tests.
 * Tests the /communities page with sort=members (default), search, and metrics display.
 */

let COMMUNITY_SLUG = ''
let COMMUNITY_NAME = ''

const createCommunityFixture = () => {
  const suffix = randomSuffix()
  return {
    slug: `pw-explore-communities-playwright-${suffix}`,
    name: `PW Explore Communities Playwright ${suffix}`,
  }
}

test.describe('Explore Communities Page', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeAll(async ({ browser }, testInfo) => {
    const fixture = createCommunityFixture()
    COMMUNITY_NAME = fixture.name
    COMMUNITY_SLUG = fixture.slug

    await withMonitoredPage(browser, testInfo, async page => {
      await loginAsTestUser(page)
      await page.evaluate(
        async ({ name, slug }) => {
          const res = await fetch('/api/v1/communities', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name, slug }),
          })
          if (!res.ok && res.status !== 409)
            throw new Error(`Failed to create community: ${res.status}`)
        },
        { name: COMMUNITY_NAME, slug: COMMUNITY_SLUG },
      )
    })
  })

  test.describe('anonymous', () => {
    // Clear auth cookies (not storageState) so cookie-consent localStorage stays set.
    test.beforeEach(async ({ page }) => {
      await page.context().clearCookies()
    })

    test('renders h1 heading', async ({ page }) => {
      await navigateTo(page, '/communities')
      await expect(page.getByTestId('communities-page-heading')).toBeVisible()
    })

    test('shows sort filter options', async ({ page }) => {
      await navigateTo(page, '/communities')
      await waitForBelowFoldHydration(page)
      await page.getByTestId('list-filters-sort-trigger').press(' ')
      await expect(page.getByTestId('list-filters-sort-option-members')).toBeVisible()
      await expect(page.getByTestId('list-filters-sort-option-name')).toBeVisible()
    })

    test('name sort dropdown updates URL', async ({ page }) => {
      await navigateTo(page, '/communities')
      await waitForBelowFoldHydration(page)
      await page.getByTestId('list-filters-sort-trigger').press(' ')
      await page.getByTestId('list-filters-sort-option-name').click()
      await expect(page).toHaveURL(/sort=name/)
    })

    test('search input filters communities', async ({ page }) => {
      await navigateTo(page, `/communities?q=${encodeURIComponent(COMMUNITY_NAME)}`)
      await expect(page.getByTestId('communities-page-heading')).toBeVisible()
      await expect(page.getByTestId(`community-card-link-${COMMUNITY_SLUG}`)).toContainText(
        COMMUNITY_NAME,
      )
    })

    test('unauthenticated user can browse communities', async ({ page }) => {
      await navigateTo(page, '/communities')
      await expect(page.getByTestId('communities-page-heading')).toBeVisible()
    })

    test('should not show Create Community button to anonymous users', async ({ page }) => {
      await navigateTo(page, '/communities')
      await expect(page.getByTestId('communities-create-cta')).toBeHidden()
    })
  })

  test('should show Create Community button for logged-in users', async ({ page }) => {
    await navigateTo(page, '/communities')
    const cta = page.getByTestId('communities-create-cta')
    await expect(cta).toBeVisible()
    await expect(cta).toHaveAttribute('href', '/communities/create')
  })
})
