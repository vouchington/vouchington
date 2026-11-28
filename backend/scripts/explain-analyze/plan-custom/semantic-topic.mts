import type { ExplainResult } from '@vouchington/explain-plan'
import { SEMANTIC_TOPIC_CANDIDATE_LIMIT } from '@services/topics/work-limits'
import { assertBoundedSemanticNearestPlan } from './semantic-nearest.mts'

// Anchor lookup via topics_pkey (1 row) plus excluding the source topic itself (t.id <> anchor, 1 row).
const SIMILAR_TOPIC_ANCHOR_ROWS = 2

const SCENARIO_CONFIG: Readonly<Record<string, { extraAnchorRows: number; lateral: boolean }>> = {
  'topic-search-semantic-cursor': { extraAnchorRows: 0, lateral: false },
  'topic-search-similar-topic': { extraAnchorRows: SIMILAR_TOPIC_ANCHOR_ROWS, lateral: true },
}

export function assertSemanticTopicSearchPlan(result: ExplainResult): void {
  const scenarioId = result.scenario_id
  if (scenarioId === undefined) return
  const config = SCENARIO_CONFIG[scenarioId]
  if (!config) return
  assertBoundedSemanticNearestPlan(result, {
    scenarioId,
    relation: 'topics',
    limit: SEMANTIC_TOPIC_CANDIDATE_LIMIT,
    maxProcessed: SEMANTIC_TOPIC_CANDIDATE_LIMIT + config.extraAnchorRows,
    lateral: config.lateral,
  })
}
