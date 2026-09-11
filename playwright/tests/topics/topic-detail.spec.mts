import { test, expect } from '../../helpers/test.mts'
import { loginAsUser, withCleanUser } from '../../helpers/auth.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'
import { insertTestRssFeed } from '../../helpers/insert-test-rss-feed.mts'
import { insertPersonalizedTopicFixture } from '../../helpers/insert-personalized-fixtures.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { chooseVote, voteTrigger } from '../../helpers/semantic-vote.mts'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
} from '../../../backend/test-helpers/index.mts'

// Seeded topic IDs from playwright-test-data.mts
const TOPICS = {
  card: {
    id: '019c64e6-f710-74cb-b36d-130af8ff1067',
    name: 'Chase Sapphire Preferred',
    slug: 'card',
  },
  rewards_program: {
    id: '019c64e6-b100-7000-b000-000000000001',
    name: 'Chase Ultimate Rewards',
    slug: 'rewards-program',
  },
  rewards_program_status: {
    id: '019c64e6-b200-7000-b000-000000000001',
    name: 'Chase Sapphire Preferred Status',
    slug: 'rewards-program-status',
  },
  referral_program: {
    id: '019c64e6-b400-7000-b000-000000000001',
    name: 'Chase Sapphire Referral',
    slug: 'referral-program',
  },
  topic: {
    id: '019c64e6-b300-7000-b000-000000000001',
    name: 'Groceries',
    slug: 'topic',
  },
}

test.describe('Topic Detail Pages', () => {
  test.use({ storageState: AUTH_STATE })

  let contributorId: string

  test.beforeAll(async () => {
    const contributor = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    if (!contributor) throw new Error('Failed to create topic detail contributor')
    contributorId = contributor.id
  })

  for (const [, { id, name, slug }] of Object.entries(TOPICS)) {
    test(`should load ${slug} detail page`, async ({ page }) => {
      await navigateTo(page, `/${slug}/${id}/posts`)

      // Verify topic name in heading
      await expect(page.getByRole('heading', { level: 1 })).toContainText(name)
      await expect(page.getByTestId('topic-detail-header')).toBeVisible()

      // Verify URL is on posts tab
      await expect(page).toHaveURL(new RegExp(`/${slug}/.+/posts`))
    })
  }

  test('should load rss_feed topic detail page at /source/<id>', async ({ page }) => {
    const unique = randomSuffix()
    const topic = await insertTestTopic(
      `Playwright RSS Feed ${unique}`,
      `playwright-rss-feed-${unique}`,
      'rss_feed',
    )

    await navigateTo(page, `/source/${topic.id}/posts`)

    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      `Playwright RSS Feed ${unique}`,
    )
    await expect(page).toHaveURL(new RegExp(`/source/.+/posts`))
  })

  test('source topic with URL in name displays clean label in h1, not the raw URL', async ({
    page,
  }) => {
    const unique = randomSuffix()
    const topic = await insertTestTopic(
      `Level1Techs (https://www.youtube.com/feeds/videos.xml?channel_id=${unique})`,
      `level1techs-yt-${unique}`,
      'rss_feed',
    )

    await navigateTo(page, `/source/${topic.id}/posts`)

    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Level1Techs (YouTube Channel)',
    )
    await expect(page.getByRole('heading', { level: 1 })).not.toContainText('youtube.com/feeds')
  })

  test('should show 404 for wrong topic type', async ({ page }) => {
    // A card topic accessed via /topic/ should 404
    const cardId = TOPICS.card.id
    const response = await page.goto(`/topic/${cardId}/discussions`)
    expect(response?.status()).toBe(404)
  })

  test('card detail page tab navigation', async ({ page }) => {
    const { id, slug } = TOPICS.card
    await navigateTo(page, `/${slug}/${id}/posts`)

    await expect(page).toHaveURL(/\/card\/.+\/posts/)

    const reviewsTab = page.getByTestId('topic-detail-tab-reviews')
    await expect(reviewsTab).toBeVisible()
    await reviewsTab.click()
    await expect(page).toHaveURL(/\/card\/.+\/reviews/)

    const dataPointsTab = page.getByTestId('topic-detail-tab-data-points')
    await expect(dataPointsTab).toBeVisible()
    await dataPointsTab.click()
    await expect(page).toHaveURL(/\/card\/.+\/data-points/)
  })

  test('rewards-program sub-pages load via direct URL navigation', async ({ page }) => {
    const { id } = TOPICS.rewards_program

    await navigateTo(page, `/rewards-program/${id}/reviews`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page).toHaveURL(/\/rewards-program\/.+\/reviews/)

    await navigateTo(page, `/rewards-program/${id}/data-points`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page).toHaveURL(/\/rewards-program\/.+\/data-points/)
  })

  test('rewards-program tab click navigation uses hyphenated slug in URLs', async ({ page }) => {
    const { id } = TOPICS.rewards_program
    await navigateTo(page, `/rewards-program/${id}/posts`)

    await expect(page).toHaveURL(/\/rewards-program\/.+\/posts/)

    const reviewsTab = page.getByTestId('topic-detail-tab-reviews')
    await expect(reviewsTab).toBeVisible()
    await reviewsTab.click()
    await expect(page).toHaveURL(/\/rewards-program\/.+\/reviews/)

    const dataPointsTab = page.getByTestId('topic-detail-tab-data-points')
    await expect(dataPointsTab).toBeVisible()
    await dataPointsTab.click()
    await expect(page).toHaveURL(/\/rewards-program\/.+\/data-points/)
  })

  test('topic detail page shows semantic sentiment choices and allows voting', async ({ page }) => {
    await loginAsUser(page, contributorId)
    const unique = randomSuffix()
    const topic = await insertTestTopic(
      `Playwright Topic Vote ${unique}`,
      `playwright-topic-vote-${unique}`,
    )

    await navigateTo(page, `/topic/${topic.id}/discussions`)

    const trigger = voteTrigger(page, 'topic-vouch-disavow-vote').first()
    await expect(trigger).toBeVisible()
    await chooseVote(page, 'topic-vouch-disavow-vote', 'vouch')
    await expect(trigger).toContainText('Vouch')
  })

  test('logged-out topic pages hide personalized follow context', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, `/card/${TOPICS.card.id}/discussions`)
    await expect(page.getByTestId('follow-context-card')).toHaveCount(0)
    // Signed-out users see the Follow button as a /login link (not a plain text link)
    await expect(page.getByTestId('signed-out-follow-link')).toBeVisible()
    // No interactive Follow button (that would require being signed-in)
    await expect(page.getByTestId('follow-button')).toHaveCount(0)
    // RSS feed link is visible in the Actions aside for all users (.first() — aside renders in both desktop and mobile drawer)
    await expect(page.getByTestId('topic-rss-feed-aside').first()).toBeVisible()
    // Mute renders as a login CTA for signed-out users (.first() — aside renders in both desktop and mobile drawer)
    await expect(page.getByTestId('topic-mute-login-link').first()).toBeVisible()
  })

  test('logged-in topic pages show follow controls', async ({ page }) => {
    await navigateTo(page, `/card/${TOPICS.card.id}/discussions`)

    await expect(page.getByTestId('follow-button').first()).toBeVisible()
    // RSS feed link is also visible for logged-in users (.first() — aside renders in both desktop and mobile drawer)
    await expect(page.getByTestId('topic-rss-feed-aside').first()).toBeVisible()
  })

  test('logged-in source topic with linked rss_feed shows Follow Source and Follow Topic buttons', async ({
    page,
  }) => {
    const unique = randomSuffix()
    const topic = await insertTestTopic(
      `Playwright RSS Source ${unique}`,
      `playwright-rss-source-${unique}`,
      'rss_feed',
    )
    await insertTestRssFeed(topic.id, `pw-src-${unique}`)
    await navigateTo(page, `/source/${topic.id}/posts`)
    // Hero shows both Follow Source and Follow Topic buttons
    await expect(page.getByTestId('follow-source-button')).toBeVisible()
    await expect(page.getByTestId('follow-topic-button')).toBeVisible()
  })

  test('logged-in topic pages show followed-user context and followed reviews first', async ({
    page,
  }) => {
    const viewer = await withCleanUser(page)
    const fixture = await insertPersonalizedTopicFixture(viewer)

    await navigateTo(page, `/topic/${fixture.topicId}/discussions`)

    const followContext = page.getByTestId('follow-context-card')
    const followedUserLinks = followContext.locator(`a[href="/user/${fixture.followedUsername}"]`)
    const unfollowedUserLinks = followContext.locator(
      `a[href="/user/${fixture.unfollowedUsername}"]`,
    )
    await expect(followContext).toBeVisible()
    await expect(followedUserLinks.first()).toBeVisible()
    await expect(unfollowedUserLinks).toHaveCount(0)

    await navigateTo(page, `/topic/${fixture.topicId}/reviews`)
    const followedReview = page
      .getByTestId('post-card-title-link')
      .filter({ hasText: fixture.followedReviewTitle })
      .first()
    const unfollowedReview = page
      .getByTestId('post-card-title-link')
      .filter({ hasText: fixture.unfollowedReviewTitle })
      .first()

    await expect(followedReview).toBeVisible()
    await expect(unfollowedReview).toBeVisible()

    const followedBox = await followedReview.boundingBox()
    const unfollowedBox = await unfollowedReview.boundingBox()

    expect(followedBox).not.toBeNull()
    expect(unfollowedBox).not.toBeNull()
    expect(followedBox!.y).toBeLessThan(unfollowedBox!.y)
  })
})
