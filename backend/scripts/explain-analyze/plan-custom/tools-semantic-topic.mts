import type { ExplainResult } from '@vouchington/explain-plan'
import { TOOLS_SEMANTIC_TOPIC_CANDIDATE_LIMIT } from '@services/topics/work-limits'
import { assertBoundedSemanticNearestPlan } from './semantic-nearest.mts'

export function assertToolsSemanticTopicSearchPlan(result: ExplainResult): void {
  assertBoundedSemanticNearestPlan(result, {
    scenarioId: 'tools-topic-search-semantic',
    relation: 'topics',
    limit: TOOLS_SEMANTIC_TOPIC_CANDIDATE_LIMIT,
  })
}
