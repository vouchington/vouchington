import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

test.describe('Keyboard shortcuts article', () => {
  test('page is discoverable via command palette', async ({ page }) => {
    await navigateTo(page, '/')
    await page.keyboard.press('ControlOrMeta+k')

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    const input = page.getByTestId('search-input')
    await input.pressSequentially('keyboard')

    await expect(page.getByTestId('search-page-shortcut-article-keyboard-shortcuts')).toBeVisible({
      timeout: 5000,
    })
  })

  test('page is linked from footer', async ({ page }) => {
    await navigateTo(page, '/')

    const link = page.getByTestId('footer-site-link-shortcuts')
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', '/article/keyboard-shortcuts')
  })
})
