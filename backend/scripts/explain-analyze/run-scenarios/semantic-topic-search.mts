import { SEMANTIC_TOPIC_SEARCH_SETTINGS } from '@services/topics/search/query-builder-semantic'
import { runAndCapture } from '../run-support.mts'
import { getTopicIds } from '../run-services.mts'
import { registerScenarioContract } from '../plan-expectations.mts'

const SEMANTIC_TOPIC_SEARCH_EMBEDDING = [1, 0, ...Array<number>(1022).fill(0)]

export async function runSemanticTopicSearchScenario(): Promise<void> {
  registerScenarioContract('topic-search-semantic-cursor', {
    expectations: [{ kind: 'custom', name: 'semanticTopic' }],
  })
  await runAndCapture(
    'topic-search-semantic-cursor',
    async () => {
      const firstPage = await getTopicIds({
        semantic_search_query: 'seed semantic cursor',
        semanticSearchEmbedding: SEMANTIC_TOPIC_SEARCH_EMBEDDING,
        sort: 'relevance',
        limit: 10,
      })
      const after = firstPage.page_info.end_cursor
      if (!after) throw new Error('Expected semantic topic search continuation cursor')
      const cursorPage = await getTopicIds({
        semantic_search_query: 'seed semantic cursor',
        semanticSearchEmbedding: SEMANTIC_TOPIC_SEARCH_EMBEDDING,
        sort: 'relevance',
        limit: 10,
        after,
      })
      if (cursorPage.results.length === 0)
        throw new Error('Expected non-empty semantic topic search cursor page')
    },
    'cursor',
    'buildTopicSearchQuery',
    { localSettings: SEMANTIC_TOPIC_SEARCH_SETTINGS },
  )
}
