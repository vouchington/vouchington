import type { ExplainResult } from '@vouchington/explain-plan'
import { SEMANTIC_TOPIC_CANDIDATE_LIMIT } from '@services/topics/work-limits'
import { assertBoundedSemanticNearestPlan } from './semantic-nearest.mts'

// Anchor lookup via topics_pkey (1 row) plus excluding the source topic itself (t.id <> anchor, 1 row).
const SIMILAR_TOPIC_ANCHOR_ROWS = 2

const SCENARIO_EXTRA_TOPIC_ROWS: Readonly<Record<string, number>> = {
  'topic-search-semantic-cursor': 0,
  'topic-search-similar-topic': SIMILAR_TOPIC_ANCHOR_ROWS,
}

export function assertSemanticTopicSearchPlan(result: ExplainResult): void {
  const extraAnchorRows =
    result.scenario_id !== undefined ? SCENARIO_EXTRA_TOPIC_ROWS[result.scenario_id] : undefined
  if (extraAnchorRows === undefined) return
  assertBoundedSemanticNearestPlan(result, {
    scenarioId: result.scenario_id!,
    relation: 'topics',
    limit: SEMANTIC_TOPIC_CANDIDATE_LIMIT,
    maxProcessed: SEMANTIC_TOPIC_CANDIDATE_LIMIT + extraAnchorRows,
  })
}
