import { test, expect, protectPlaywrightHookTimeouts } from '../../helpers/test.mts'
import { ADMIN_AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from 'vouchington-tooling/playwright'
import { createTestLandingPage } from '../../../backend/test-helpers/index.mts'

const TEST_USER_ID = '019f0000-0000-7000-8000-000000000000'

test.describe('Admin landing page analytics', () => {
  test.use({ storageState: ADMIN_AUTH_STATE })

  let landingPageSlug = ''

  test.beforeAll(async () => {
    protectPlaywrightHookTimeouts(test.info())
    const { slug } = await createTestLandingPage(TEST_USER_ID, 'Playwright Admin Analytics Test')
    landingPageSlug = slug
  })

  test('admin can view a target landing page analytics dashboard', async ({ page }) => {
    await navigateTo(page, `/landing/tests/${landingPageSlug}/analytics`)

    await expect(page).toHaveURL(new RegExp(`/landing/tests/${landingPageSlug}/analytics$`))
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })
})
