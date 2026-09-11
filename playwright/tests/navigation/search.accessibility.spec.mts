import { navigateTo } from '../../helpers/navigate-to.mts'
import { test, expect } from '../../helpers/test.mts'

test.describe('Accessibility', () => {
  test('tab filter buttons have aria-pressed attribute', async ({ page }) => {
    await navigateTo(page, '/')
    await page.keyboard.press('ControlOrMeta+k')

    const allButton = page.getByTestId('search-tab-all')
    const topicsButton = page.getByTestId('search-tab-topics')
    const postsButton = page.getByTestId('search-tab-posts')
    const newsButton = page.getByTestId('search-tab-news')
    const domainsButton = page.getByTestId('search-tab-domains')
    const pagesButton = page.getByTestId('search-tab-pages')
    const buttons = [allButton, topicsButton, postsButton, newsButton, domainsButton, pagesButton]

    for (const button of buttons) {
      const pressed = await button.getAttribute('aria-pressed')
      expect(pressed).toMatch(/^(true|false)$/)
    }
  })

  test('exactly one tab has aria-pressed=true', async ({ page }) => {
    await navigateTo(page, '/')
    await page.keyboard.press('ControlOrMeta+k')

    const allButton = page.getByTestId('search-tab-all')
    const topicsButton = page.getByTestId('search-tab-topics')
    const postsButton = page.getByTestId('search-tab-posts')
    const newsButton = page.getByTestId('search-tab-news')
    const domainsButton = page.getByTestId('search-tab-domains')
    const pagesButton = page.getByTestId('search-tab-pages')
    const buttons = [allButton, topicsButton, postsButton, newsButton, domainsButton, pagesButton]

    const pressedValues = await Promise.all(
      buttons.map(button => button.getAttribute('aria-pressed')),
    )
    const pressedCount = pressedValues.filter(pressed => pressed === 'true').length
    expect(pressedCount).toBe(1)
  })

  test('ArrowRight moves focus to next tab, ArrowLeft moves to previous', async ({ page }) => {
    await navigateTo(page, '/')
    await page.keyboard.press('ControlOrMeta+k')

    const allButton = page.getByTestId('search-tab-all')
    const topicsButton = page.getByTestId('search-tab-topics')

    // Focus the All tab and arrow right to Topics
    await allButton.focus()
    await page.keyboard.press('ArrowRight')
    await expect(topicsButton).toBeFocused()

    // Arrow left returns to All
    await page.keyboard.press('ArrowLeft')
    await expect(allButton).toBeFocused()
  })

  test('ArrowRight cycles active tab from search input', async ({ page }) => {
    await navigateTo(page, '/')
    await page.keyboard.press('ControlOrMeta+k')

    const allButton = page.getByTestId('search-tab-all')
    const topicsButton = page.getByTestId('search-tab-topics')

    // All tab should be active initially
    await expect(allButton).toHaveAttribute('aria-pressed', 'true')

    // Press ArrowRight while input is focused (natural cmdk state)
    await page.keyboard.press('ArrowRight')

    // Topics tab should now be active
    await expect(topicsButton).toHaveAttribute('aria-pressed', 'true')
    await expect(allButton).toHaveAttribute('aria-pressed', 'false')
  })

  test('ArrowRight at end of input text cycles to next tab', async ({ page }) => {
    await navigateTo(page, '/')
    await page.keyboard.press('ControlOrMeta+k')

    const input = page.getByTestId('search-input')
    const allButton = page.getByTestId('search-tab-all')
    const topicsButton = page.getByTestId('search-tab-topics')

    // Type some text — cursor ends up at the end
    await input.pressSequentially('test')
    await expect(allButton).toHaveAttribute('aria-pressed', 'true')

    // ArrowRight at end of text switches tab
    await page.keyboard.press('ArrowRight')
    await expect(topicsButton).toHaveAttribute('aria-pressed', 'true')
    await expect(allButton).toHaveAttribute('aria-pressed', 'false')
  })

  test('ArrowLeft in middle of input text moves cursor, not tab', async ({ page }) => {
    await navigateTo(page, '/')
    await page.keyboard.press('ControlOrMeta+k')

    const input = page.getByTestId('search-input')
    const allButton = page.getByTestId('search-tab-all')

    // Type some text — cursor is at position 4 (end)
    await input.pressSequentially('test')
    await expect(allButton).toHaveAttribute('aria-pressed', 'true')

    // ArrowLeft moves cursor from position 4 → 3, not switching tab
    await page.keyboard.press('ArrowLeft')
    await expect(allButton).toHaveAttribute('aria-pressed', 'true')

    // ArrowLeft again: 3 → 2, still no tab switch
    await page.keyboard.press('ArrowLeft')
    await expect(allButton).toHaveAttribute('aria-pressed', 'true')
  })

  test('ArrowLeft at start of input text cycles to previous tab', async ({ page }) => {
    await navigateTo(page, '/')
    await page.keyboard.press('ControlOrMeta+k')

    const input = page.getByTestId('search-input')
    const allButton = page.getByTestId('search-tab-all')
    const pagesButton = page.getByTestId('search-tab-pages')

    // Type a single character then move cursor to position 0
    await input.pressSequentially('x')
    await page.keyboard.press('ArrowLeft') // cursor: 1 → 0 (no tab switch)
    await expect(allButton).toHaveAttribute('aria-pressed', 'true')

    // ArrowLeft at position 0 wraps to Pages (last tab)
    await page.keyboard.press('ArrowLeft')
    await expect(pagesButton).toHaveAttribute('aria-pressed', 'true')
    await expect(allButton).toHaveAttribute('aria-pressed', 'false')
  })

  test('ArrowLeft from All tab wraps to Pages tab', async ({ page }) => {
    await navigateTo(page, '/')
    await page.keyboard.press('ControlOrMeta+k')

    const allButton = page.getByTestId('search-tab-all')
    const pagesButton = page.getByTestId('search-tab-pages')

    // All tab should be active initially
    await expect(allButton).toHaveAttribute('aria-pressed', 'true')

    // Press ArrowLeft - should wrap to Pages (last tab)
    await page.keyboard.press('ArrowLeft')
    await expect(pagesButton).toHaveAttribute('aria-pressed', 'true')
    await expect(allButton).toHaveAttribute('aria-pressed', 'false')
  })

  test('ArrowRight from Pages tab wraps to All tab', async ({ page }) => {
    await navigateTo(page, '/')
    await page.keyboard.press('ControlOrMeta+k')

    const input = page.getByTestId('search-input')
    const allButton = page.getByTestId('search-tab-all')
    const pagesButton = page.getByTestId('search-tab-pages')

    // Navigate to Pages tab by clicking. pagesButton is a Locator, but the rule's
    // identifier-prefix heuristic false-positives because the name starts with "page".
    // eslint-disable-next-line playwright/prefer-locator -- see comment above
    await pagesButton.click()
    await expect(pagesButton).toHaveAttribute('aria-pressed', 'true')

    // Re-focus input (cmdk behavior after click)
    await input.focus()

    // Press ArrowRight - should wrap to All (first tab)
    await page.keyboard.press('ArrowRight')
    await expect(allButton).toHaveAttribute('aria-pressed', 'true')
    await expect(pagesButton).toHaveAttribute('aria-pressed', 'false')
  })

  test('modifier+Arrow does not change active tab', async ({ page }) => {
    await navigateTo(page, '/')
    await page.keyboard.press('ControlOrMeta+k')

    const input = page.getByTestId('search-input')
    const allButton = page.getByTestId('search-tab-all')

    // Type some text so modifier+arrow has cursor movement semantics
    await input.pressSequentially('test')
    await expect(allButton).toHaveAttribute('aria-pressed', 'true')

    // Shift+ArrowRight (text selection) should not change tab
    await page.keyboard.press('Shift+ArrowRight')
    await expect(allButton).toHaveAttribute('aria-pressed', 'true')

    // ControlOrMeta+ArrowRight (word navigation) should not change tab
    await page.keyboard.press('ControlOrMeta+ArrowRight')
    await expect(allButton).toHaveAttribute('aria-pressed', 'true')

    // Alt+ArrowRight (word navigation on macOS) should not change tab
    await page.keyboard.press('Alt+ArrowRight')
    await expect(allButton).toHaveAttribute('aria-pressed', 'true')
  })
})
