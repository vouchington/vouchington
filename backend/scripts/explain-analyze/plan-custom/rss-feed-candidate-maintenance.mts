import { extractQueryName, type ExplainResult } from '@data-stores/psql'
import { collectPlanNodes } from '../plan-nodes.mts'

/** Require the keyset/foreign-key access paths on each captured maintenance statement. */
export function assertRssFeedCandidateMaintenanceIndexes(result: ExplainResult): void {
  const queryName = extractQueryName(result.query_text)
  const expectedIndexes: Readonly<Record<string, readonly string[]>> = {
    getCandidateReconciliation: [
      'rss_feed_item_candidate_reconciliations_pkey',
      'rss_feed_item_feed_candidates_pkey',
    ],
    getCandidateReconciliationUpperBound: ['rss_feed_item_candidate_reconciliations_pkey'],
    getCandidateReconciliationPage: ['rss_feed_item_candidate_reconciliations_pkey'],
    readCandidateReconciliationSources: ['idx_rss_feed_item_sources__item_feed'],
    readCandidateReconciliationTopics: ['rss_feed_item_topic_candidates_pkey'],
    lockCandidateReconciliationFeeds: ['rss_feeds_pkey'],
    updateCandidateReconciliationSources: ['idx_rss_feed_item_sources__item_feed'],
    updateCandidateReconciliationTopics: ['rss_feed_item_topic_candidates_pkey'],
    checkpointCandidateReconciliation: ['rss_feed_item_candidate_reconciliations_pkey'],
    completeCandidateReconciliation: ['rss_feed_item_candidate_reconciliations_pkey'],
  }
  const expected = queryName ? expectedIndexes[queryName] : undefined
  if (!expected) throw new Error(`${result.name} is not an RSS candidate maintenance query`)
  const indexes = new Set(
    collectPlanNodes(result.plan).flatMap(node =>
      typeof node['Index Name'] === 'string' ? [node['Index Name']] : [],
    ),
  )
  // The generic UPDATE plan may drive the same bounded keys from either side of the pair.
  const topicUpdateUsesReverseIndex =
    queryName === 'updateCandidateReconciliationTopics' &&
    indexes.has('idx_rss_feed_item_topic_candidates__topic')
  const missing = expected.filter(
    index =>
      !indexes.has(index) &&
      !(index === 'rss_feed_item_topic_candidates_pkey' && topicUpdateUsesReverseIndex),
  )
  if (missing.length > 0)
    throw new Error(
      `${result.name} must use RSS candidate maintenance index(es) ${missing.join(', ')}`,
    )
}
