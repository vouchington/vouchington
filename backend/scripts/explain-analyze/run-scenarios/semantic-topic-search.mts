import { HNSW_SEARCH_DEFAULT_SETTINGS } from '@data-stores/psql'
import { runAndCapture, seedTopicId } from '../run-support.mts'
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
    { localSettings: HNSW_SEARCH_DEFAULT_SETTINGS },
  )

  registerScenarioContract('topic-search-similar-topic', {
    expectations: [{ kind: 'custom', name: 'semanticTopic' }],
  })
  await runAndCapture(
    'topic-search-similar-topic',
    async () => {
      const firstPage = await getTopicIds({
        similar_topic_id: seedTopicId,
        sort: 'relevance',
        limit: 10,
      })
      const after = firstPage.page_info.end_cursor
      if (!after) throw new Error('Expected similar-topic search continuation cursor')
      const cursorPage = await getTopicIds({
        similar_topic_id: seedTopicId,
        sort: 'relevance',
        limit: 10,
        after,
      })
      if (cursorPage.results.length === 0)
        throw new Error('Expected non-empty similar-topic search cursor page')
    },
    'cursor',
    'buildTopicSearchQuery',
    { localSettings: HNSW_SEARCH_DEFAULT_SETTINGS },
  )
}
