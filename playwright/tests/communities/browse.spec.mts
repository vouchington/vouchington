import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

/**
 * Community browse/discovery page tests.
 * Creates a unique community via API and verifies it appears on the browse page.
 */

const COMMUNITY_SLUG = 'playwright-popular-community'
const COMMUNITY_NAME = '000 Playwright Popular Community'

test.describe('Communities Browse Page', () => {
  test('browse page renders h1', async ({ page }) => {
    await navigateTo(page, '/communities')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Communities')
  })

  test('created community appears in browse list', async ({ page }) => {
    await navigateTo(page, `/communities?q=${encodeURIComponent(COMMUNITY_NAME)}`)
    await expect(page.getByTestId('community-card').first()).toBeVisible()
    await expect(page.getByTestId(`community-card-link-${COMMUNITY_SLUG}`)).toContainText(
      COMMUNITY_NAME,
    )
  })

  test('community card omits owner byline', async ({ page }) => {
    await navigateTo(page, `/communities?q=${encodeURIComponent(COMMUNITY_NAME)}`)
    await expect(page.getByTestId('community-card-owner')).not.toBeAttached()
  })

  test('community links to detail page', async ({ page }) => {
    await navigateTo(page, `/communities?q=${encodeURIComponent(COMMUNITY_NAME)}`)
    await page.getByTestId(`community-card-link-${COMMUNITY_SLUG}`).click()
    await expect(page).toHaveURL(`/communities/${COMMUNITY_SLUG}`)
  })

  test('unauthenticated user can view browse page', async ({ page }) => {
    await navigateTo(page, '/communities')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Communities')
  })
})
