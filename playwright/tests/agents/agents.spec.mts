import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

test.describe('Agents Pages', () => {
  test.use({ storageState: AUTH_STATE })

  test('should display agents list page for admin', async ({ page }) => {
    await navigateTo(page, '/agents')

    // Check page title
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Agents')

    // Check that the test agent appears in the table
    await expect(page.locator('table')).toBeVisible()
    await expect(page.locator('td').first()).toBeVisible()
  })

  test('should navigate to agent detail page', async ({ page }) => {
    await navigateTo(page, '/agents')

    // Click the first agent link
    await page.locator('a[href^="/agent/"]').first().click()

    // Should show agent detail
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    // Should have conversations section
    await expect(page.getByTestId('agent-conversations-heading')).toBeVisible()
  })

  test('should show agent detail by slug', async ({ page }) => {
    await navigateTo(page, '/agent/test-reviewer')

    // Should show the agent detail
    await expect(page.getByRole('heading', { level: 1 })).toContainText('test-reviewer')

    // Should show conversations section
    await expect(page.getByTestId('agent-conversations-heading')).toBeVisible()
  })

  test('should navigate to conversation detail', async ({ page }) => {
    await navigateTo(page, '/agent/test-reviewer')

    // Seed data ensures at least one conversation exists
    const conversationLink = page.locator('a[href*="/conversation/"]').first()
    await expect(conversationLink).toBeVisible()
    await conversationLink.click()

    // Should show conversation detail
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('should be mobile responsive', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await navigateTo(page, '/agents')

    // Page should still be visible
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })
})
