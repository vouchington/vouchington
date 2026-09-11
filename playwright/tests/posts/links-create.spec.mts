import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

test.describe('Submit a Link page', () => {
  test.use({ storageState: AUTH_STATE })

  test('renders the submit link form', async ({ page }) => {
    await navigateTo(page, '/links/create')
    await expect(page.getByTestId('submit-link-form')).toBeVisible()
    await expect(page.getByTestId('submit-link-url-input')).toBeVisible()
    await expect(page.getByTestId('submit-link-title-input')).toBeVisible()
    await expect(page.getByTestId('submit-link-button')).toBeVisible()
  })

  test('shows error when submission fails', async ({ page }) => {
    await navigateTo(page, '/links/create')
    await page.route('**/api/v1/posts', async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({ status: 422, json: { message: 'Invalid URL' } })
      } else {
        await route.continue()
      }
    })
    await page
      .getByTestId('submit-link-url-input')
      .pressSequentially('https://example.com/test-link')
    await page.getByTestId('submit-link-button').click()
    await expect(page.getByTestId('submit-link-error')).toBeVisible()
  })
})
