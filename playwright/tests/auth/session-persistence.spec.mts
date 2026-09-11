import { test, expect } from '../../helpers/test.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { requireTestValue } from '../../helpers/assertions.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
} from '../../../backend/test-helpers/index.mts'

test.describe('Session Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
  })

  test('session persists after page reloads and can create a discussion', async ({ page }) => {
    const user = requireTestValue(
      await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS),
      'Failed to create session-persistence contributor',
    )
    const userId = user.id

    // Login, then navigate to the feed (loginAsUser injects cookies but does not navigate).
    await loginAsUser(page, userId)
    await navigateTo(page, '/feed/news')
    await expect(page).toHaveURL(/\/feed\/news/)

    // Refresh the page — session should persist
    await page.reload()
    await expect(page).toHaveURL(/\/feed\/news/)

    await navigateTo(page, '/discussions/create')
    await expect(page).toHaveURL('/discussions/create')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('New Discussion')

    // Refresh on create page — should stay authenticated, not redirect to login
    await page.reload()
    await expect(page).toHaveURL('/discussions/create')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('New Discussion')
    await waitForBelowFoldHydration(page)

    // Create a discussion with a title and content
    const title = `Test Discussion ${randomSuffix()}`
    await page.getByTestId('post-form-title-input').fill(title)
    await page
      .getByTestId('post-form-content-textarea')
      .fill('This is a test discussion created by Playwright.')
    await page.getByTestId('post-form-submit').click()

    // Should redirect to the created discussion page
    await expect(page).toHaveURL(/\/discussion\//)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(title)
  })
})
