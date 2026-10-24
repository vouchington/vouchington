import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from 'vouchington-tooling/playwright'

test.describe('My Data', () => {
  test.use({ storageState: AUTH_STATE })

  test('displays data management page', async ({ page }) => {
    await navigateTo(page, '/my/data')
    await page.waitForLoadState('load')

    await expect(page.getByTestId('delete-account-section-heading')).toBeVisible()
  })

  test('shows export and delete account privacy controls', async ({ page }) => {
    await navigateTo(page, '/my/data')

    await expect(page.getByTestId('data-export-section-heading')).toBeVisible()
    await page.getByTestId('delete-account-open-dialog').click()
    await expect(page.getByTestId('delete-account-dialog-description')).toBeVisible()
    await expect(page.getByTestId('delete-account-confirmation-input')).toBeVisible()
    await expect(page.getByTestId('delete-account-confirm-button')).toBeDisabled()
    await page.getByTestId('delete-account-cancel-button').click()
  })

  test('offers a data export request when none exists', async ({ page }) => {
    await page.route('**/api/v1/users/*/data-request', route =>
      route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }),
    )
    await navigateTo(page, '/my/data')

    await expect(page.getByTestId('data-request-section-request-export')).toBeVisible()
  })

  test('offers a new data export request after the previous export expired', async ({ page }) => {
    await page.route('**/api/v1/users/*/data-request', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '019f0000-0000-7000-8000-0000000000aa',
          status: 'expired',
          expires_at: null,
          created_at: new Date().toISOString(),
          download_url: null,
        }),
      }),
    )
    await navigateTo(page, '/my/data')

    await expect(page.getByTestId('data-request-section-request-data-export')).toBeVisible()
  })

  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, '/my/data')
    await expect(page).toHaveURL('/login')
  })
})
