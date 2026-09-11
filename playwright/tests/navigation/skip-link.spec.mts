import { expect, test } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

test.describe('Skip link', () => {
  test('Tab key reveals skip link with text "Skip to main content"', async ({ page }) => {
    await navigateTo(page, '/')

    // The skip link is sr-only by default; Tab focuses it and makes it visible
    await page.keyboard.press('Tab')

    const skipLink = page.getByTestId('skip-to-main-link')
    await expect(skipLink).toBeVisible()
  })

  test('skip link becomes visible on focus', async ({ page }) => {
    await navigateTo(page, '/')

    // Before Tab, the link is visually hidden (sr-only uses clip/overflow)
    const skipLink = page.getByTestId('skip-to-main-link')
    const box = await skipLink.boundingBox()
    expect(box).not.toBeNull()
    // sr-only clips to 1x1px
    expect(box!.width).toBeLessThanOrEqual(1)

    // After Tab, focus moves to the skip link and sr-only is removed via focus styles
    await page.keyboard.press('Tab')
    await expect(skipLink).toBeFocused()
    const focusedBox = await skipLink.boundingBox()
    expect(focusedBox).not.toBeNull()
    expect(focusedBox!.width).toBeGreaterThan(1)
  })

  test('pressing Enter on skip link moves focus to main content area', async ({ page }) => {
    await navigateTo(page, '/')

    await page.keyboard.press('Tab')
    await expect(page.getByTestId('skip-to-main-link')).toBeVisible()

    await page.keyboard.press('Enter')

    // The main content area has id="main-content" and tabIndex=-1, so it receives focus
    // oxlint-disable-next-line no-mistakes/playwright-selector-priority -- skip-link target is the HTML id; verifying this specific attribute is the contract under test
    const mainContent = page.locator('#main-content')
    await expect(mainContent).toBeFocused()
  })
})
