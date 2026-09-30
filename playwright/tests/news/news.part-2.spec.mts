import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'

import { randomSuffix } from '../../helpers/random-id.mts'

import { insertTestPost } from '../../../backend/test-helpers/entities/posts.mts'

import { createEntityRelationWithElection } from '../../../backend/test-helpers/entities/dispatch.mts'

import { insertTestTopic } from '../../helpers/insert-test-topic.mts'

import { insertTestRssFeed } from '../../helpers/insert-test-rss-feed.mts'

import { write } from '../../../backend/data-stores/psql/clients.mts'
import { insertTestRssFeedItem } from '../../../backend/test-helpers/entities/rss-feed-items.mts'
import { requireTestValue } from '../../helpers/assertions.mts'

// Fixed test user ID seeded by playwright-test-data.mts.
const TEST_USER_ID = '019f0000-0000-7000-8000-000000000000'

// URL ID of `test-item-1` seeded in playwright-test-data.mts.
// The RSS item's url_id links it to https://example.com/article1.
const TEST_ITEM_1_URL_ID = '019c64e6-f8b0-7000-b000-000000000003'

test.describe('News Page', () => {
  test.use({ storageState: AUTH_STATE })

  let storyTitle: string

  let storySlug: string
  let youtubeItemId!: string
  let youtubeFeedId!: string
  let youtubeUrlId!: string

  test.beforeAll(async () => {
    // Seed a story-type post and link it to test-item-1's URL so that the /news
    // card for that item shows a "Discussions" link pointing to /story/<slug>.
    // This avoids triggering the story-teller OpenAI agent — we assert on the
    // already-resolved end state rather than waiting for the agent to finish.
    const random = randomSuffix()
    storyTitle = `Playwright Story Discussion ${random}`
    storySlug = `pw-story-discussion-${random}`

    const postId = await insertTestPost({
      title: storyTitle,
      slug: storySlug,
      createdById: TEST_USER_ID,
      markdown: '',
      postType: 'story',
    })

    // Link the story post to the seeded item's URL with votes_score_net > 0
    // so getPostIdsByUrlIds() includes it in related_posts_by_url_id.
    await createEntityRelationWithElection(postId, TEST_ITEM_1_URL_ID, TEST_USER_ID, 1)

    const suffix = `youtube-summary-${randomSuffix()}`
    const topic = await insertTestTopic(
      `YouTube Summary Test Topic ${suffix}`,
      `youtube-summary-test-${suffix}`,
    )

    const feed = await insertTestRssFeed(topic.id, suffix)
    youtubeFeedId = feed.id
    const articleUrl = `https://${feed.hostname}/youtube-summary-${suffix}`
    const urlResult = await write(
      `/* news.part-2.spec insert youtube summary url */
       INSERT INTO urls (url, hostname_id, pathname, search_params)
       VALUES ($1, $2, $3, '{}'::JSONB)
       ON CONFLICT (url) DO UPDATE SET hostname_id = EXCLUDED.hostname_id
       RETURNING id`,
      [articleUrl, feed.hostnameId, `/youtube-summary-${suffix}`],
    )
    const urlId = urlResult.rows[0].id as string
    youtubeUrlId = urlId

    youtubeItemId = await insertTestRssFeedItem({
      rssFeedId: youtubeFeedId,
      urlId,
      guid: `youtube-summary-${suffix}`,
      itemData: {
        title: 'Playwright YouTube Summary Item',
        link: articleUrl,
        guid: `youtube-summary-${suffix}`,
        isoDate: '2026-06-17T18:33:06.000Z',
        media_type: 'video',
        video_platform: 'youtube',
        video_id: 'abc123def456',
        'media:description': 'Playwright YouTube media description body.',
        'media:starRating': { average: 5, count: 659, min: 1, max: 5 },
        'media:statistics': { views: 11_740 },
      },
      contentSha256: Buffer.from('02'.padStart(64, '0'), 'hex'),
    })
  })

  test.afterAll(async () => {
    const errors: unknown[] = []
    if (youtubeFeedId && youtubeItemId) {
      try {
        await write(
          `/* news.part-2.spec cleanup youtube summary rss source */
           DELETE FROM rss_feed_item_sources
           WHERE rss_feed_id = $1 AND rss_feed_item_id = $2`,
          [youtubeFeedId, youtubeItemId],
        )
      } catch (error) {
        errors.push(error)
      }
    }
    if (youtubeFeedId) {
      try {
        await write(
          `/* news.part-2.spec cleanup youtube summary rss feed */
          DELETE FROM rss_feeds WHERE id = $1`,
          [youtubeFeedId],
        )
      } catch (error) {
        errors.push(error)
      }
    }
    if (youtubeItemId) {
      try {
        await write(
          `/* news.part-2.spec cleanup youtube summary rss item */
          DELETE FROM rss_feed_item_ids WHERE id = $1`,
          [youtubeItemId],
        )
      } catch (error) {
        errors.push(error)
      }
    }
    if (youtubeUrlId) {
      try {
        await write(
          `/* news.part-2.spec cleanup youtube summary url */
          DELETE FROM urls WHERE id = $1`,
          [youtubeUrlId],
        )
      } catch (error) {
        errors.push(error)
      }
    }
    if (errors.length > 0) throw new AggregateError(errors, 'YouTube RSS summary cleanup failed')
  })

  test('/news modal Previous/Next buttons are below article content', async ({ page }) => {
    await navigateTo(page, '/news')

    const showMore = page.getByTestId('news-item-show-more-link')
    await expect
      .poll(() => showMore.count(), {
        message: 'seeded news articles with excerpts should be visible',
      })
      .toBeGreaterThan(0)

    await showMore.first().click()
    await page.waitForURL(/rss_item=/)

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    const prevButton = dialog.getByTestId('rss-feed-item-modal-previous-button')
    const nextButton = dialog.getByTestId('rss-feed-item-modal-next-button')

    // Both buttons must exist
    await expect(prevButton).toBeVisible()
    await expect(nextButton).toBeVisible()

    // The dialog heading must appear above the navigation buttons in the DOM
    const headingBox = await dialog.getByTestId('rss-feed-item-modal-title').boundingBox()
    const prevBox = await prevButton.boundingBox()

    const heading = requireTestValue(headingBox, 'Expected news modal heading bounding box')
    const previous = requireTestValue(prevBox, 'Expected news modal previous-button bounding box')
    expect(heading.y).toBeLessThan(previous.y)
  })

  test('/news modal renders YouTube media description and metadata row', async ({ page }) => {
    await navigateTo(page, `/news?rss_item=${youtubeItemId}`)

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Playwright YouTube media description body.')).toBeVisible()
    await expect(dialog.getByText('No article summary available.')).toHaveCount(0)
    await expect(dialog.getByTestId('youtube-rss-metadata-row')).toHaveText(
      'YouTube \u00B7 11,740 views \u00B7 5 rating from 659 ratings',
    )
  })

  test('/news card titles do not contain raw HTML entities', async ({ page }) => {
    await navigateTo(page, '/news')

    // Collect all visible article title text from cards
    const titleLinks = page.getByTestId('news-item-card').getByTestId('news-item-title-link')
    await expect(titleLinks.first()).toBeVisible()

    const titles = await titleLinks.allTextContents()
    for (const title of titles) {
      // Raw HTML entity references must not appear in rendered titles
      expect(title).not.toMatch(/&#[0-9]+;/)
      expect(title).not.toMatch(/&#x[0-9a-fA-F]+;/i)
    }
  })

  test('source badge links to source topic page and appears exactly once per card', async ({
    page,
  }) => {
    await navigateTo(page, '/news')

    const cards = page.getByTestId('news-item-card')
    await expect
      .poll(() => cards.count(), { message: 'seeded news articles should be visible' })
      .toBeGreaterThan(0)

    // The source badge inside each card should link to a topic page
    const sourceBadgeLinks = page.getByTestId('source-badge-link')
    await expect
      .poll(() => sourceBadgeLinks.count(), {
        message: 'seeded source badge links should be visible',
      })
      .toBeGreaterThan(0)

    // Source links should point to internal topic pages (e.g. /topic/..., /card/..., /organization/...)
    const firstHref = await sourceBadgeLinks.first().getAttribute('href')
    expect(firstHref).toMatch(/^\/[a-z-]+\/.+/)

    // Each card must show the source badge exactly once — no duplicate source chip
    const firstCard = cards.first()
    const sourceLinksInFirstCard = firstCard.getByTestId('source-badge-link')
    await expect(sourceLinksInFirstCard).toHaveCount(1)
  })

  test('story discussion link routes to /story/<slug>, not /discussion/<slug>', async ({
    page,
  }) => {
    // This test verifies the URL shape of existing discussion links — it does NOT trigger
    // the story-teller agent. The story post was seeded in beforeAll and linked to
    // test-item-1's URL, so the card renders a Discuss button immediately on page load.
    // Use ?q= to surface test-item-1 which has an old isoDate and would otherwise be buried.
    await navigateTo(page, '/news?q=Test+News+Article+1')

    // Discussion links are now inside the Discuss dropdown. Open it first.
    const discussButton = page.getByTestId('news-discuss-button').first()
    await expect(discussButton).toBeVisible()
    await discussButton.click()

    // Find the discussion link that points to the story post we seeded.
    const storyLink = page.locator(`a[href="/story/${storySlug}"]`)
    await expect(storyLink).toBeVisible()

    await expect(storyLink).toHaveAttribute('href', `/story/${storySlug}`)
    await expect(storyLink).not.toHaveAttribute('href', /^\/discussion\//)
  })

  test('"Discuss" button is inside the card boundary', async ({ page }) => {
    const response = await page.goto('/news', { waitUntil: 'load' })
    expect(response, 'raw /news navigation should return a response').not.toBeNull()
    expect(response!.ok()).toBe(true)

    const cards = page.getByTestId('news-item-card')
    await expect
      .poll(() => cards.count(), { message: 'seeded news articles should be visible' })
      .toBeGreaterThan(0)

    const discussButton = page.getByTestId('news-discuss-button').first()
    await expect(
      discussButton,
      'signed-in news cards should show the global Discuss menu button',
    ).toBeVisible()

    expect(
      await discussButton.evaluate(el => el.closest('[data-pw="news-item-card"]') !== null),
    ).toBe(true)
  })
})
