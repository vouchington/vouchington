import { expect, test } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

test.describe('live tmux localization smoke', () => {
  test('anonymous landing renders in English without a browser error', async ({ page }) => {
    await navigateTo(page, '/')
    await expect(page.getByTestId('localization-tmux-smoke-home-page')).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })

  test('login renders in English without a browser error', async ({ page }) => {
    await navigateTo(page, '/login')
    await expect(page.getByTestId('localization-tmux-smoke-login-page')).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })

  test('news renders in English without a browser error', async ({ page }) => {
    await navigateTo(page, '/news')
    await expect(page.getByTestId('localization-tmux-smoke-news-page')).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })
})
