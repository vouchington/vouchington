import { write } from '@data-stores/psql'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'
import { collectPlanNodes, definePlanStatisticsRefresh } from '../../query-plans.mts'

export const analyzeClassifierComparisonPlanTables = definePlanStatisticsRefresh(async () => {
  await write(`/* analyzeClassifierComparisonPlanTables */ ANALYZE
    classifier_decision_batches, topic_classifier_results,
    relation__post__category__topic, relation__post__category__topic__votes,
    relation__rss_feed_item__category__topic, relation__rss_feed_item__category__topic__votes
  `)
})

const BATCH_INDEX_PREFIX = 'idx_classifier_decision_batches__'

/** The batch indexes that lead with a filter column of the report and end in the batch id. */
export const COMPARISON_BATCH_INDEXES = {
  classifier: `${BATCH_INDEX_PREFIX}classifier`,
  community: `${BATCH_INDEX_PREFIX}scope`,
  post: `${BATCH_INDEX_PREFIX}post`,
  rssFeedItem: `${BATCH_INDEX_PREFIX}rss_feed_item`,
} as const

export type ComparisonBatchScan = {
  nodeType: string
  indexName: string
  /** The scan's index condition, which carries the id range bound. */
  condition: string
  /** Rows the scan read: those returned plus those removed by a filter, across all loops. */
  work: number
}

/** What the explained report query did on `classifier_decision_batches`, one entry per scan node. */
export function summarizeComparisonBatchScans(plan: unknown): ComparisonBatchScan[] {
  const scans: ComparisonBatchScan[] = []
  for (const scan of collectPlanNodes(plan)) {
    if (scan['Relation Name'] !== 'classifier_decision_batches' || scan.Alias !== 'batch') continue
    scans.push({
      nodeType: String(scan['Node Type']),
      indexName: String(scan['Index Name']),
      condition: stringFromUnknown(scan['Index Cond'] ?? ''),
      work:
        (Number(scan['Actual Rows']) + Number(scan['Rows Removed by Filter'] ?? 0)) *
        Number(scan['Actual Loops']),
    })
  }
  return scans
}
