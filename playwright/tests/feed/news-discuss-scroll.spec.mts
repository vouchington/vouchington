import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

test.describe('Scroll-to-top on navigation from /feed/news', () => {
  test.use({ storageState: AUTH_STATE })

  // Validates two user-visible requirements in one flow:
  // (1) keyboard ArrowDown-to-open + ArrowDown + Enter navigation through the
  //     feed filter dropdown reaches the correct route, and (2) any forward
  //     navigation to a new pathname lands the user at the top of the page.
  //
  // The Friends tab is used because it is always available on the seeded feed.
  // The popstate Back/Forward exclusion is exercised by Vitest unit tests in
  // web/components/__tests__/scroll-to-top.test.tsx, which mock the exact
  // popstate → pathname-change sequence.
  test('keyboard arrow-then-enter on feed dropdown navigates and scrolls to top', async ({
    page,
  }) => {
    await navigateTo(page, '/feed/news')

    // Scroll down so window.scrollY > 0 where the page is tall enough.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    // Verify the page was actually scrollable — if this fails, the seeded content
    // is not taller than the viewport and the test cannot validate scroll-to-top.
    const preNavScrollY = await page.evaluate(() => window.scrollY)
    expect(preNavScrollY).toBeGreaterThan(0)

    const feedFilter = page.getByTestId('feed-sub-filter-trigger')
    await expect(feedFilter).toBeVisible()
    // Open via ArrowDown (not click or Enter) so Radix moves focus to the first
    // menu item without the Enter keyup firing a click on the focused anchor.
    // Then wait for the menu to render before the second ArrowDown reaches Friends.
    await feedFilter.focus()
    await page.keyboard.press('ArrowDown')
    const friendsLink = page.locator('a[href="/feed/news/friends"]').first()
    await expect(friendsLink).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await expect(friendsLink).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/feed\/news\/friends/)

    const scrollY = await page.evaluate(() => window.scrollY)
    expect(scrollY).toBe(0)
  })
})
