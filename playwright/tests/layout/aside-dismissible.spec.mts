import { expect, test } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { DESKTOP_VIEWPORT } from '../../helpers/viewport-constants.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { createTestUser } from '../../../backend/test-helpers/index.mts'

const LG_VIEWPORT = { width: 1024, height: 768 }

test.describe('Dismissible asides', () => {
  test.use({ storageState: AUTH_STATE })

  test('dismiss button hides the aside', async ({ page }) => {
    await page.setViewportSize(LG_VIEWPORT)
    await navigateTo(page, '/feed/posts')

    // Ensure the aside is not dismissed from a previous test run
    await page.evaluate(() => localStorage.removeItem('aside-connect-social'))
    await page.reload()

    const aside = page.locator('main aside')
    const connectSocial = aside.getByTestId('connect-social-aside-content')
    await expect(connectSocial).toBeVisible()

    await aside.getByTestId('dismissible-aside-button-aside-connect-social').click()

    await expect(connectSocial).toBeHidden()
  })

  test('dismissed aside stays hidden after page reload', async ({ page }) => {
    await page.setViewportSize(LG_VIEWPORT)
    await navigateTo(page, '/feed/posts')

    // Ensure the aside is not dismissed from a previous test run
    await page.evaluate(() => localStorage.removeItem('aside-connect-social'))
    await page.reload()

    const aside = page.locator('main aside')
    const connectSocial = aside.getByTestId('connect-social-aside-content')
    await expect(connectSocial).toBeVisible()

    await aside.getByTestId('dismissible-aside-button-aside-connect-social').click()
    await expect(connectSocial).toBeHidden()

    // Reload the page — the aside should stay hidden (localStorage persisted)
    await page.reload()

    await expect(aside.getByTestId('connect-social-aside-content')).toBeHidden()
  })

  test('dismissal persists across pages in the same route group', async ({ page }) => {
    await page.setViewportSize(LG_VIEWPORT)
    await navigateTo(page, '/feed/posts')

    await page.evaluate(() => localStorage.removeItem('aside-connect-social'))
    await page.reload()

    const aside = page.locator('main aside')
    const connectSocial = aside.getByTestId('connect-social-aside-content')
    await expect(connectSocial).toBeVisible()

    await aside.getByTestId('dismissible-aside-button-aside-connect-social').click()
    await expect(connectSocial).toBeHidden()

    // Navigate to another feed page — same dismissal key persists
    await navigateTo(page, '/feed/news')

    await expect(
      page.locator('main aside').getByTestId('connect-social-aside-content'),
    ).toBeHidden()
  })

  test('aside visual snapshot before dismiss', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
    await navigateTo(page, '/feed/posts')

    await page.evaluate(() => localStorage.removeItem('aside-connect-social'))
    await page.reload()

    const aside = page.locator('main aside')
    await expect(aside.getByTestId('connect-social-aside-content')).toBeVisible()
  })
})

test.describe('Activity-gated dismissible asides', () => {
  // A freshly created user has zero landing pages and zero follows, so both
  // activity-gated asides render. Each test uses an independent page context via
  // loginAsUser so localStorage dismiss state is never shared between tests.
  let freshUserId = ''

  test.beforeAll(async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Failed to create fresh user for activity-gated aside tests')
    freshUserId = user.id
  })

  test('create-landing-page aside is visible for user with no landing page', async ({ page }) => {
    await page.setViewportSize(LG_VIEWPORT)
    // loginAsUser navigates to '/' to set cookies; we then navigate to /news
    await loginAsUser(page, freshUserId)
    await navigateTo(page, '/news')

    const aside = page.locator('main aside')
    const createLandingPage = aside.getByTestId('create-landing-page-aside-content')
    await expect(createLandingPage).toBeVisible()

    await aside.getByTestId('dismissible-aside-button-aside-create-landing-page').click()
    await expect(createLandingPage).toBeHidden()
  })

  test('find-people aside is visible for user with no follows', async ({ page }) => {
    await page.setViewportSize(LG_VIEWPORT)
    await loginAsUser(page, freshUserId)
    await navigateTo(page, '/feed/news')

    const aside = page.locator('main aside')
    const findPeople = aside.getByTestId('find-people-aside-content')
    await expect(findPeople).toBeVisible()

    await aside.getByTestId('dismissible-aside-button-aside-find-people').click()
    await expect(findPeople).toBeHidden()
  })
})
