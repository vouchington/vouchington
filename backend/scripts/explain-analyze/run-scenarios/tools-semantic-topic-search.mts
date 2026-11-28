import { HNSW_SEARCH_DEFAULT_SETTINGS } from '@data-stores/psql'
import { toolsSearchTopicsByEmbedding } from '@services/topics/tools/semantic'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

const TOOLS_SEMANTIC_TOPIC_EMBEDDING = [1, 0, ...Array<number>(1022).fill(0)]

export async function runToolsSemanticTopicSearchScenario(): Promise<void> {
  registerScenarioContract('tools-topic-search-semantic', {
    expectations: [{ kind: 'custom', name: 'toolsSemanticTopic' }],
  })
  await runAndCapture(
    'tools-topic-search-semantic',
    async () => {
      const results = await toolsSearchTopicsByEmbedding(TOOLS_SEMANTIC_TOPIC_EMBEDDING, 25)
      if (results.length !== 25) {
        throw new Error(`Expected 25 semantic topic tool results, got ${results.length}`)
      }
    },
    undefined,
    'toolsSearchTopicsSemantic',
    { localSettings: HNSW_SEARCH_DEFAULT_SETTINGS },
  )
}
