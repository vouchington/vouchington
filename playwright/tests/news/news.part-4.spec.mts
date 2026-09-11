import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'

test.describe('News Page', () => {
  test.use({ storageState: AUTH_STATE })

  test('/news cards do not render a duplicate source-topic chip', async ({ page }) => {
    await navigateTo(page, '/news')

    const cards = page.getByTestId('news-item-card')
    await expect
      .poll(() => cards.count(), { message: 'seeded news articles should be visible' })
      .toBeGreaterThan(0)

    // The source-topic chip has been removed — source is shown only once next to the date
    await expect(page.getByTestId('source-topic-chip')).toHaveCount(0)
  })
})
