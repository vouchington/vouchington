import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import {
  insertTestRssFeedItem,
  addCategoryToRssFeedItem,
} from '../../../backend/test-helpers/entities/rss-feed-items.mts'
import { addScoredCategoryTopicRelationToRssFeedItem } from '../../../backend/test-helpers/entities/rss-feed-item-category-relations.mts'
import { insertTestRssFeed } from '../../../backend/test-helpers/entities/rss-feeds.mts'
import { insertTestTopic } from '../../../backend/test-helpers/entities/topics/core.mts'

// Fixed test user ID seeded by playwright-test-data.mts.
const TEST_USER_ID = '019f0000-0000-7000-8000-000000000000'

// URL ID of `test-item-1` seeded in playwright-test-data.mts.
const TEST_ITEM_1_URL_ID = '019c64e6-f8b0-7000-b000-000000000003'

test.describe('News Hashtag Search', () => {
  // contentTopicSlug is the topic we search with #hashtag.
  // The RSS feed is owned by a *different* topic so that only the
  // category branch of the hashtag_topic_ids union filter can match.
  let contentTopicSlug: string

  test.beforeAll(async () => {
    const random = randomSuffix()
    contentTopicSlug = `pw-news-hashtag-${random}`

    const contentTopicId = await insertTestTopic({
      name: `Playwright News Hashtag ${random}`,
      slug: contentTopicSlug,
      createdById: TEST_USER_ID,
    })
    // Feed owner is a separate topic — it has no relationship to contentTopic
    // except through the item's category, so the test proves the category branch
    // of the union filter fires.
    const feedOwnerTopicId = await insertTestTopic({
      name: `Playwright Hashtag Feed Owner ${random}`,
      slug: `pw-news-hashtag-owner-${random}`,
      createdById: TEST_USER_ID,
    })
    const feedId = await insertTestRssFeed({
      topicId: feedOwnerTopicId,
      title: `Playwright Hashtag Feed ${random}`,
    })
    const contentSha256 = Buffer.from(
      Array.from({ length: 32 }, () => Math.floor(Math.random() * 256)),
    )
    const itemId = await insertTestRssFeedItem({
      rssFeedId: feedId,
      urlId: TEST_ITEM_1_URL_ID,
      guid: `pw-hashtag-item-${random}`,
      itemData: {
        title: `Playwright Hashtag News Article ${random}`,
        link: `https://example.com/pw-hashtag-${random}`,
        isoDate: new Date().toISOString(),
      },
      contentSha256,
    })
    // Categorize item under the content topic — this is the only connection
    // between the item and contentTopicId.
    await addCategoryToRssFeedItem(itemId, contentTopicId)
    await addScoredCategoryTopicRelationToRssFeedItem(itemId, contentTopicId)
  })

  test('#hashtag search on /news returns categorized items', async ({ page }) => {
    // Navigate directly to the pre-filled URL to test the backend union filter
    // without coupling to autocomplete UI timing. The item's feed is owned by
    // a different topic (feedOwnerTopicId), so results can only appear via the
    // category branch of the hashtag_topic_ids union filter.
    await navigateTo(page, `/news?q=%23${contentTopicSlug}`)

    await expect(page.getByTestId('news-item-card').first()).toBeVisible()
  })

  test('clear button on /news search removes query from URL', async ({ page }) => {
    await navigateTo(page, `/news?q=%23${contentTopicSlug}`)

    const clearButton = page.getByTestId('search-input-clear')
    await expect(clearButton).toBeVisible()
    await clearButton.click()

    await page.waitForURL(url => !url.searchParams.has('q'))
    await expect(clearButton).toBeHidden()
  })
})
