import { expect, test } from '../../helpers/test.mts'

// The 404 route renders StatusPage in the full-stack app. Rate-limited and error-boundary
// variants need a Storybook server, which the Playwright workflow does not start. Those
// variants stay covered by Storybook browser tests.

test.describe('status page and error page rendering', () => {
  test('404 route renders StatusPage with correct data-pw attributes', async ({ page }) => {
    const response = await page.goto('/this-route-does-not-exist-404-check')
    expect(response?.status()).toBe(404)

    await expect(page.getByTestId('status-page-title')).toBeVisible()
    await expect(page.getByTestId('status-page-title')).toContainText('Page not found')
    await expect(page.getByTestId('status-page-description')).toBeVisible()
    await expect(page.getByTestId('status-page-home-link')).toHaveAttribute('href', '/')
  })
})
