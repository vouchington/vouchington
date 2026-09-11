import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { createTestLandingPage } from '../../../backend/test-helpers/index.mts'

// Seeded test user ID (tests@voucha.ai)
const TEST_USER_ID = '019f0000-0000-7000-8000-000000000000'

test.describe('Landing Page Analytics', () => {
  test.use({ storageState: AUTH_STATE })

  let analyticsSlug: string

  test.beforeAll(async () => {
    const { slug } = await createTestLandingPage(TEST_USER_ID, 'Playwright Analytics Test')
    analyticsSlug = slug
  })

  test('redirects unauthenticated users to login', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, `/my/landing-page/${analyticsSlug}/analytics`)
    await expect(page).toHaveURL(/\/login/)
  })

  test('displays analytics dashboard', async ({ page }) => {
    await navigateTo(page, `/my/landing-page/${analyticsSlug}/analytics`)

    const heading = page.getByRole('heading', { level: 1 })
    await expect(heading).toBeVisible()
  })
})
