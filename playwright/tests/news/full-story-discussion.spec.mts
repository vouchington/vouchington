import { test, expect } from '../../helpers/test.mts'
import { navigateTo, randomSuffix } from 'vouchington-tooling/playwright'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import {
  insertTestStory,
  setTestItemStoryId,
} from '../../../backend/test-helpers/entities/stories.mts'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'
import { insertTestRssFeed } from '../../helpers/insert-test-rss-feed.mts'
import { upsertTestArticleUrl } from '../../helpers/rss-article-fixture.mts'
import { insertTestRssFeedItem } from '../../../backend/test-helpers/entities/rss-feed-items.mts'

test.describe('News full-story discussion CTA', () => {
  test.use({ storageState: AUTH_STATE })

  test('story clusters without a story post show the full-story discussion button', async ({
    page,
  }) => {
    const suffix = randomSuffix()
    const topic = await insertTestTopic(
      `Full Story Discussion ${suffix}`,
      `full-story-discussion-${suffix}`,
    )
    const feed = await insertTestRssFeed(topic.id, suffix)
    const story = await insertTestStory({ title: `Playwright Full Story ${suffix}` })

    for (const index of [1, 2]) {
      const articleUrl = `https://${feed.hostname}/full-story-discussion-${suffix}-${index}`
      const urlId = await upsertTestArticleUrl({
        url: articleUrl,
        hostnameId: feed.hostnameId,
        pathname: `/full-story-discussion-${suffix}-${index}`,
      })
      const itemId = await insertTestRssFeedItem({
        rssFeedId: feed.id,
        urlId,
        guid: `full-story-discussion-${suffix}-${index}`,
        itemData: {
          title: `Playwright Full Story Article ${suffix} ${index}`,
          link: articleUrl,
          guid: `full-story-discussion-${suffix}-${index}`,
          isoDate: new Date().toISOString(),
        },
        contentSha256: Buffer.from('03'.padStart(64, '0'), 'hex'),
      })
      await setTestItemStoryId(itemId, story.id)
    }

    await navigateTo(
      page,
      `/news?q=${encodeURIComponent(`Playwright Full Story Article ${suffix}`)}`,
    )

    await expect(page.getByTestId('news-item-cluster-discuss-story').first()).toBeVisible()
  })
})
