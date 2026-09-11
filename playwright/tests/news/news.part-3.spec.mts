import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'

test.describe('News Page', () => {
  test.use({ storageState: AUTH_STATE })

  test('global Discuss button is visible for logged-in users on news items', async ({ page }) => {
    await navigateTo(page, '/news')

    const cards = page.getByTestId('news-item-card')
    await expect
      .poll(() => cards.count(), { message: 'seeded news articles should be visible' })
      .toBeGreaterThan(0)

    // When no existing discussion posts: single-action plain button (no dropdown).
    // When existing posts present: dropdown trigger. Both use news-discuss-button.
    const discussButton = page.getByTestId('news-discuss-button').first()
    await expect(discussButton).toBeVisible()
  })
})
