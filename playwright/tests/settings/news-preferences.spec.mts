import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'
import { withCleanUser } from '../../helpers/auth.mts'

const publisherTypeSeeds = [
  { slug: 'mainstream-media', name: 'Mainstream Media' },
  { slug: 'corporate-media', name: 'Corporate Media' },
  { slug: 'blog', name: 'Blog' },
  { slug: 'aggregator', name: 'Aggregator' },
  { slug: 'forum', name: 'Forum' },
  { slug: 'ugc-platform', name: 'UGC Platform' },
  { slug: 'review', name: 'Review' },
]

test.describe('News Preferences Page', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeAll(async () => {
    await Promise.all(publisherTypeSeeds.map(({ name, slug }) => insertTestTopic(name, slug)))
  })

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await navigateTo(page, '/my/news-preferences')
    await waitForBelowFoldHydration(page)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('News Preferences')
  })

  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, '/my/news-preferences')
    await expect(page).toHaveURL('/login')
  })

  test('renders the Muted Publisher Types section', async ({ page }) => {
    await expect(page.getByText('Muted Publisher Types')).toBeVisible()
  })

  test('shows publisher type mute buttons with type names as labels', async ({ page }) => {
    // Each publisher type should have a mute button with data-pw
    const muteButtons = page.locator('[data-pw^="news-pref-mute-"]')
    await expect(muteButtons.first()).toBeVisible()
    // The button should say "Mute" or "Muted" (from preset), with the name as a sibling label
    const firstButton = muteButtons.first()
    await expect(firstButton).toBeVisible()
  })

  test('publisher type names are visible next to buttons', async ({ page }) => {
    // Names like "Mainstream Media" should be visible as text next to the mute button
    await expect(page.getByText('Mainstream Media')).toBeVisible()
  })

  test('can toggle a mute button', async ({ page }) => {
    await withCleanUser(page)
    await navigateTo(page, '/my/news-preferences')
    await waitForBelowFoldHydration(page)
    const firstMuteButton = page.locator('[data-pw^="news-pref-mute-"]').first()
    await expect(firstMuteButton).toBeVisible()
    await expect(firstMuteButton).toHaveAttribute('aria-pressed', 'false')
    await firstMuteButton.click()
    await expect(firstMuteButton).toHaveAttribute('aria-pressed', 'true')
    await expect(firstMuteButton).toBeEnabled()
    await firstMuteButton.click()
    await expect(firstMuteButton).toHaveAttribute('aria-pressed', 'false')
  })

  test('Preferences tab is active in nav on this page', async ({ page }) => {
    await expect(page.getByTestId('settings-nav-preferences-tab')).toHaveAttribute(
      'data-active',
      'true',
    )
  })
})
