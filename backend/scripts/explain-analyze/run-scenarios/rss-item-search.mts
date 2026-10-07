import { SEED_PREFIX, runAndCapture, seedTopicId } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { searchRssFeedItems } from '../run-services.mts'
import { runSemanticRssSearchScenario } from './semantic-rss-search.mts'
import { runPreciseRssRecencyCursorScenario } from './precise-rss-cursor.mts'

export async function runRssItemSearchScenarios(): Promise<void> {
  // RSS feed items search — by seeded feed id. The seed source rows intentionally share
  // hostnames across feeds, so this covers the broader shared-hostname source shape.
  const seedRssFeedId = `${SEED_PREFIX}-0800-7000-8000-000000000000`
  registerScenarioContract('rss-feed-items-search-by-rss-feed-source-group', {
    expectations: [],
    crossPartition: { rss_feed_items: 'RSS search ranks matching items across id ranges.' },
  })
  await runAndCapture(
    'rss-feed-items-search-by-rss-feed-source-group',
    () => searchRssFeedItems({ rss_feed_ids: [seedRssFeedId], limit: 25 }),
    'by-rss-feed-source-group',
  )

  // RSS feed items search — by category topic
  registerScenarioContract('rss-feed-items-search-by-category-topic', {
    expectations: [],
    crossPartition: { rss_feed_items: 'RSS search ranks matching items across id ranges.' },
  })
  await runAndCapture(
    'rss-feed-items-search-by-category-topic',
    () => searchRssFeedItems({ category_topic_ids: [seedTopicId], limit: 25 }),
    'by-category-topic',
  )

  // RSS feed items search — text search
  registerScenarioContract('rss-feed-items-search-text', {
    expectations: [],
    crossPartition: { rss_feed_items: 'RSS search ranks matching items across id ranges.' },
  })
  await runAndCapture(
    'rss-feed-items-search-text',
    () => searchRssFeedItems({ text_search_query: 'seed', limit: 25 }),
    'text',
  )

  // RSS feed items search — media and cursor variants
  registerScenarioContract('rss-feed-items-search-media', {
    expectations: [],
    crossPartition: { rss_feed_items: 'RSS search ranks matching items across id ranges.' },
  })
  await runAndCapture(
    'rss-feed-items-search-media',
    () => searchRssFeedItems({ media_types: ['article'], limit: 25 }),
    'media',
  )
  registerScenarioContract('rss-feed-items-search-cursor', {
    expectations: [],
    crossPartition: { rss_feed_items: 'RSS search ranks matching items across id ranges.' },
  })
  await runAndCapture(
    'rss-feed-items-search-cursor',
    async () => {
      const firstPage = await searchRssFeedItems({ rss_feed_ids: [seedRssFeedId], limit: 10 })
      const after = firstPage.page_info.end_cursor
      if (after) await searchRssFeedItems({ rss_feed_ids: [seedRssFeedId], limit: 10, after })
    },
    'cursor',
  )
  registerScenarioContract('rss-feed-items-search-global-cursor', {
    expectations: [{ kind: 'custom', name: 'paginationSpecial' }],
    crossPartition: { rss_feed_items: 'The global cursor pages RSS items across id ranges.' },
  })
  await runAndCapture(
    'rss-feed-items-search-global-cursor',
    async () => {
      const firstPage = await searchRssFeedItems({ limit: 10 })
      const after = firstPage.page_info.end_cursor
      if (after) await searchRssFeedItems({ limit: 10, after })
    },
    'global-cursor',
  )
  await runSemanticRssSearchScenario()
  await runPreciseRssRecencyCursorScenario()
}
