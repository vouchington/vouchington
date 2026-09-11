import { navigateTo } from '../../helpers/navigate-to.mts'
import { test, expect } from '../../helpers/test.mts'

test.describe('Honeypot fields', () => {
  test('login form has hidden honeypot fields', async ({ page }) => {
    await navigateTo(page, '/login')

    // Honeypot fields should exist in the DOM
    const websiteInput = page.locator('input[name="hp_website"]')
    const phoneInput = page.locator('input[name="hp_phone"]')

    await expect(websiteInput).toBeAttached()
    await expect(phoneInput).toBeAttached()

    // Fields must not be visible to users
    await expect(websiteInput).toBeHidden()
    await expect(phoneInput).toBeHidden()

    // Fields must have tabIndex=-1 so keyboard users cannot reach them
    await expect(websiteInput).toHaveAttribute('tabindex', '-1')
    await expect(phoneInput).toHaveAttribute('tabindex', '-1')

    // The wrapping div must be aria-hidden
    const honeypotContainer = page.locator('[aria-hidden="true"]').filter({
      has: page.locator('input[name="hp_website"]'),
    })
    await expect(honeypotContainer).toBeAttached()
  })

  test('normal login flow works with empty honeypot fields', async ({ page }) => {
    // Mock the email token endpoint and verify the frontend sends empty honeypot fields.
    // Inspecting the request payload directly avoids network flakiness and rate limit
    // interactions that occur when making real API calls across parallel CI shards.
    await page.route('**/api/v1/auth/email-address/tokens', async route => {
      const postData = route.request().postDataJSON() as Record<string, unknown>
      // Honeypot fields must be absent or empty in the submitted payload
      expect(postData?.['hp_website'] ?? '').toBe('')
      expect(postData?.['hp_phone'] ?? '').toBe('')
      await route.fulfill({ status: 200, body: '{}' })
    })

    await navigateTo(page, '/login')

    // Enter email — honeypot fields stay empty
    const emailInput = page.getByTestId('login-email-input')
    await emailInput.pressSequentially('tests@voucha.ai')

    const submitButton = page.getByTestId('login-continue-with-email-button')
    await expect(submitButton).toBeEnabled()
    await submitButton.click()

    // Should proceed to code entry step (not get blocked)
    await expect(page.getByTestId('login-verification-code-input')).toBeVisible()
  })
})
