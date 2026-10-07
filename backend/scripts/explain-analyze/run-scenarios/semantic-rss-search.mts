import { runAndCapture } from '../run-support.mts'
import { searchRssFeedItems } from '../run-services.mts'
import { registerScenarioContract } from '../plan-expectations.mts'

const SEMANTIC_RSS_SEARCH_EMBEDDING = [1, 0, ...Array<number>(1022).fill(0)]

export async function runSemanticRssSearchScenario(): Promise<void> {
  registerScenarioContract('rss-feed-items-search-semantic-cursor', {
    expectations: [],
    crossPartition: {
      rss_feed_items: 'Semantic RSS search ranks matching items across id ranges.',
    },
  })
  await runAndCapture(
    'rss-feed-items-search-semantic-cursor',
    async () => {
      const dependencies = {
        getCachedSearchEmbedding: async () => SEMANTIC_RSS_SEARCH_EMBEDDING,
      }
      const firstPage = await searchRssFeedItems({
        semantic_search_query: 'seed semantic cursor',
        limit: 10,
        dependencies,
      })
      const after = firstPage.page_info.end_cursor
      if (!after) throw new Error('Expected semantic RSS search continuation cursor')
      await searchRssFeedItems({
        semantic_search_query: 'seed semantic cursor',
        limit: 10,
        after,
        dependencies,
      })
    },
    'cursor',
  )
}
