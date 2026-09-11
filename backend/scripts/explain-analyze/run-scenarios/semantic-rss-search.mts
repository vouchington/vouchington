import { runAndCapture } from '../run-support.mts'
import { searchRssFeedItems } from '../run-services.mts'

const SEMANTIC_RSS_SEARCH_EMBEDDING = [1, 0, ...Array<number>(1022).fill(0)]

export async function runSemanticRssSearchScenario(): Promise<void> {
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
