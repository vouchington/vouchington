import { test, expect } from '../../helpers/test.mts'

test.describe('404 Not Found Page', () => {
  test('renders 404 page with navigation links', async ({ page }) => {
    const response = await page.goto('/this-page-definitely-does-not-exist-abc123')
    expect(response?.status()).toBe(404)

    await expect(page.getByTestId('status-page-title')).toContainText('Page not found')
    await expect(page.getByTestId('status-page-description')).toContainText(
      'may have moved or never existed',
    )

    await expect(page.getByTestId('status-page-home-link')).toHaveAttribute('href', '/')
    await expect(page.getByTestId('status-page-topics-link')).toHaveAttribute('href', '/topics')
    await expect(page.getByTestId('status-page-discussions-link')).toHaveAttribute(
      'href',
      '/discussions',
    )
    await expect(page.getByTestId('status-page-reviews-link')).toHaveAttribute('href', '/reviews')
  })
})
