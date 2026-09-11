import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

test.describe('Feed media rendering', () => {
  test.use({ storageState: AUTH_STATE })

  test('renders podcast player for audio items', async ({ page }) => {
    await navigateTo(page, '/feed/podcasts')

    // Find the podcast card by the episode player widget (audio lives in global provider, not card)
    const podcastCard = page
      .getByTestId('news-item-card')
      .filter({ has: page.getByTestId('podcast-episode-player') })
    await expect(podcastCard).toBeVisible()
    await expect(
      podcastCard.getByTestId('news-item-title-link').filter({ hasText: 'Test Podcast Episode 1' }),
    ).toBeVisible()

    // Episode player widget should show a play button (audio lives in global mini-player)
    await expect(podcastCard.getByTestId('podcast-episode-player')).toBeVisible()

    // Duration should be displayed (1830s = 30:30)
    await expect(podcastCard.getByTestId('podcast-episode-duration')).toHaveText('Duration: 30:30')
  })

  test('renders video embed play button for video items', async ({ page }) => {
    await navigateTo(page, '/feed/videos')

    const videoCard = page
      .getByTestId('news-item-card')
      .filter({ has: page.getByTestId('video-embed-play-button') })
    await expect(
      videoCard.getByTestId('news-item-title-link').filter({ hasText: 'Test YouTube Video 1' }),
    ).toBeVisible()

    // Play button should be rendered over the video placeholder
    await expect(videoCard.getByTestId('video-embed-play-button')).toBeVisible()
  })

  test('video play button expands to iframe embed', async ({ page }) => {
    await navigateTo(page, '/feed/videos')

    const videoCard = page.getByTestId('news-item-card').filter({
      has: page.getByTestId('news-item-title-link').filter({ hasText: 'Test YouTube Video 1' }),
    })
    const playButton = videoCard.getByTestId('video-embed-play-button')
    await expect(playButton).toBeVisible()

    await playButton.click()

    // Iframe should appear with the YouTube nocookie embed URL
    const iframe = videoCard.locator('iframe').first()
    await expect(iframe).toBeVisible()
    await expect(iframe).toHaveAttribute('src', /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/)
  })

  test('audio item modal shows podcast player', async ({ page }) => {
    await navigateTo(page, '/feed/podcasts')

    // Find podcast card by episode player widget
    const podcastCard = page
      .getByTestId('news-item-card')
      .filter({ has: page.getByTestId('podcast-episode-player') })
    await expect(podcastCard).toBeVisible()

    await podcastCard.getByTestId('news-item-show-more-link').click()
    await expect(page).toHaveURL(/rss_item=/)

    const dialog = page.getByTestId('rss-feed-item-modal')
    await expect(dialog).toBeVisible()

    // Modal should also show the episode player widget
    await expect(dialog.getByTestId('podcast-episode-player')).toBeVisible()
  })

  test('news item card kebab shows manage-categories menu item', async ({ page }) => {
    await navigateTo(page, '/feed/news')

    const card = page.getByTestId('news-item-card').first()
    await expect(card).toBeVisible()

    // Open the card kebab (compact FollowerShareActions trigger)
    await card.getByTestId('follower-share-more-actions-button').click()

    // The manage-categories menu item should appear in the dropdown
    await expect(page.getByTestId('manage-categories-menu-item')).toBeVisible()
  })

  test('manage-categories dialog shows Category card heading', async ({ page }) => {
    await navigateTo(page, '/feed/news')

    const card = page.getByTestId('news-item-card').first()
    await expect(card).toBeVisible()

    await card.getByTestId('follower-share-more-actions-button').click()
    await page.getByTestId('manage-categories-menu-item').click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTestId('manage-tags-active-heading')).toHaveText('Category')
    await expect(dialog.getByTestId('manage-tags-current-section')).toBeVisible()
  })
})
