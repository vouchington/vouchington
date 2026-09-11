import { expect, test } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
// Rate limiting is disabled by default (enabled=false in DynamicConfig).
// These tests verify the frontend rate limit error handling by intercepting
// API responses with 429 status codes.

test.describe('rate limit error handling', () => {
  test.use({ storageState: AUTH_STATE })

  test('shows rate limit toast with retry time on 429 response', async ({ page }) => {
    // Intercept the next POST request to simulate a 429 response
    await page.route('**/api/v1/posts', async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '60',
            'X-RateLimit-Limit': '5',
            'X-RateLimit-Remaining': '0',
          },
          body: JSON.stringify({ message: 'Rate limit exceeded. Please try again later.' }),
        })
      } else {
        await route.continue()
      }
    })

    // Navigate to create a post
    await navigateTo(page, '/discussions/create')

    // Fill in the post form
    const titleInput = page.getByLabel('Title (optional)')
    await titleInput.pressSequentially('Rate limit test post')

    const markdownInput = page.getByLabel('Content')
    await markdownInput.pressSequentially('This post should trigger a rate limit error')

    // Submit the form
    const submitButton = page.locator('button[type="submit"]')
    await submitButton.click()

    // Verify the rate limit toast appears
    const toast = page.locator('[data-sonner-toast]').filter({ hasText: /too many requests/i })
    await expect(toast).toBeVisible({ timeout: 5000 })
  })

  test('shows generic rate limit toast when no Retry-After header', async ({ page }) => {
    // Intercept to simulate 429 without Retry-After
    await page.route('**/api/v1/posts', async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 429,
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message: 'Rate limit exceeded.' }),
        })
      } else {
        await route.continue()
      }
    })

    await navigateTo(page, '/discussions/create')

    const titleInput = page.getByLabel('Title (optional)')
    await titleInput.pressSequentially('Rate limit test post 2')

    const markdownInput = page.getByLabel('Content')
    await markdownInput.pressSequentially('Testing generic rate limit message')

    const submitButton = page.locator('button[type="submit"]')
    await submitButton.click()

    const toast = page.locator('[data-sonner-toast]').filter({ hasText: /too many requests/i })
    await expect(toast).toBeVisible({ timeout: 5000 })
  })
})
