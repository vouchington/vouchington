import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { createTestLandingPage } from '../../../backend/test-helpers/index.mts'

const TEST_USER_ID = '019f0000-0000-7000-8000-000000000000'

test.describe('Admin landing page analytics', () => {
  test.use({ storageState: AUTH_STATE })

  let landingPageId = ''

  test.beforeAll(async () => {
    const { landingPageId: pageId } = await createTestLandingPage(
      TEST_USER_ID,
      'Playwright Admin Analytics Test',
    )
    landingPageId = pageId
  })

  test('admin can view a target landing page analytics dashboard', async ({ page }) => {
    await navigateTo(page, `/admin/landing-pages/${landingPageId}/analytics`)

    await expect(page).toHaveURL(/\/admin\/landing-pages\/[^/]+\/analytics$/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })
})
