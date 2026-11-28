import type { ExplainResult } from '@vouchington/explain-plan'
import { SEMANTIC_RSS_ITEM_CANDIDATE_LIMIT } from '@services/rss-feed-items/work-limits'
import { assertBoundedSemanticNearestPlan } from './semantic-nearest.mts'

export function assertSemanticRssSearchPlan(result: ExplainResult): void {
  assertBoundedSemanticNearestPlan(result, {
    scenarioId: 'rss-feed-items-search-semantic-cursor',
    relation: 'rss_feed_items',
    limit: SEMANTIC_RSS_ITEM_CANDIDATE_LIMIT,
  })
}
