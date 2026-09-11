import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { insertTestPodcastShow } from '../../helpers/insert-test-podcast.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'

test.describe('Podcast Hub', () => {
  let suffix: string
  let topicSlug: string
  let categorySlug: string
  let episodeIds: string[]

  test.beforeAll(async () => {
    suffix = randomSuffix()
    const podcast = await insertTestPodcastShow(suffix)
    topicSlug = podcast.topicSlug
    categorySlug = podcast.categorySlug
    episodeIds = podcast.episodeIds
  })

  test('/podcasts renders the podcast hub heading', async ({ page }) => {
    await navigateTo(page, '/podcasts')

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Podcasts')
  })

  test('/podcasts shows the podcasts list with seeded show card', async ({ page }) => {
    await navigateTo(page, '/podcasts')

    await expect(page.getByTestId('podcasts-list')).toBeVisible()
    await expect(page.getByTestId('podcast-show-card').first()).toBeVisible()
    await expect(page.getByTestId('podcast-show-title').first()).toBeVisible()
  })

  test('/podcasts shows podcast show metadata for seeded show', async ({ page }) => {
    await navigateTo(page, '/podcasts')

    // These selectors require cover_art_url and is_explicit to be set in the fixture
    await expect(page.getByTestId('podcast-show-cover-art').first()).toBeVisible()
    await expect(page.getByTestId('podcast-show-author').first()).toBeVisible()
    await expect(page.getByTestId('podcast-explicit-badge').first()).toBeVisible()
    await expect(page.getByTestId('podcast-category-chip').first()).toBeVisible()
  })

  test('/podcasts/[category] filters by category and renders heading', async ({ page }) => {
    // Uses a unique per-run slug to avoid Valkey null-cache poisoning (24-min TTL).
    await navigateTo(page, `/podcasts/${categorySlug}`)

    // displayName = 'Business <suffix>' — contains 'Business'
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Business')
    await expect(page.getByTestId('podcasts-category-list')).toBeVisible()
  })

  test('/podcasts/[category] shows the seeded podcast (has matching category)', async ({
    page,
  }) => {
    // The seeded podcast has rss_feed_categories row with topic_id = bizTopicId, so it appears.
    await navigateTo(page, `/podcasts/${categorySlug}`)

    await expect(page.getByTestId('podcast-show-card').first()).toBeVisible()
  })

  test('/podcasts/[nonexistent-category] renders empty state', async ({ page }) => {
    await navigateTo(page, '/podcasts/zzz-nonexistent-category-for-testing')

    // Page should load without error and the category list container is always rendered
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByTestId('podcasts-category-list')).toBeVisible()
  })

  test('/source/[slug] podcast show page shows metadata aside and episode player', async ({
    page,
  }) => {
    await navigateTo(page, `/source/${topicSlug}/latest`)

    // Metadata aside shows podcast show info
    await expect(page.getByTestId('podcast-show-metadata-aside')).toBeVisible()
    await expect(page.getByTestId('podcast-source-cover-art')).toBeVisible()
    await expect(page.getByTestId('podcast-source-author')).toBeVisible()
    await expect(page.getByTestId('podcast-source-description')).toBeVisible()
    await expect(page.getByTestId('podcast-source-explicit-badge')).toBeVisible()
    await expect(page.getByTestId('podcast-source-category-chip').first()).toBeVisible()

    // The news subpage for a podcast show renders episode items with play-trigger widgets
    // (audio lives in the global PodcastPlayerProvider mini-player, not inside the card)
    await expect(page.getByTestId('podcast-episode-player').first()).toBeVisible()
  })

  test.describe('mini-player links', () => {
    test.use({ storageState: AUTH_STATE })

    test.beforeEach(async ({ page }) => {
      // The seeded episode enclosure URL is a fake hostname (podcast-<suffix>.example.com/episode-1.mp3)
      // that does not resolve. Intercept it so the audio element doesn't trigger a browser issue.
      await page.route(/\.example\.com\/.*\.mp3$/, route =>
        route.fulfill({ status: 200, contentType: 'audio/mpeg', body: '' }),
      )
    })

    test('mini-player shows episode and show links after play', async ({ page }) => {
      await navigateTo(page, `/source/${topicSlug}/latest`)

      await page.getByTestId('podcast-episode-player').first().getByRole('button').click()

      await expect(page.getByTestId('podcast-mini-player')).toBeVisible()
      await expect(page.getByTestId('podcast-mini-player-title')).toBeVisible()
      await expect(page.getByTestId('podcast-mini-player-show')).toBeVisible()
      await expect(page.getByTestId('podcast-mini-player-cover')).toBeVisible()
    })

    test('mini-player episode title navigates to source modal', async ({ page }) => {
      await navigateTo(page, `/source/${topicSlug}/latest`)

      await page.getByTestId('podcast-episode-player').first().getByRole('button').click()

      await expect(page.getByTestId('podcast-mini-player')).toBeVisible()
      await page.getByTestId('podcast-mini-player-title').click()

      await expect(page).toHaveURL(new RegExp(`rss_item=${encodeURIComponent(episodeIds[0])}`))
    })

    test('mini-player show title navigates to show page', async ({ page }) => {
      await navigateTo(page, `/source/${topicSlug}/latest`)

      await page.getByTestId('podcast-episode-player').first().getByRole('button').click()

      await expect(page.getByTestId('podcast-mini-player')).toBeVisible()
      await page.getByTestId('podcast-mini-player-show').click()

      await expect(page).toHaveURL(new RegExp(`/source/${topicSlug}/latest`))
    })
  })

  test('podcast show title links to /latest tab', async ({ page }) => {
    await navigateTo(page, '/podcasts')

    // podcast-show-title is an <a> — verify its href points to /latest (not /news)
    const titleLink = page.getByTestId('podcast-show-title').first()
    await expect(titleLink).toBeVisible()
    await expect(titleLink).toHaveAttribute('href', /\/source\/[^/]+\/latest$/)
  })
})
