import type { ExplainResult } from '@data-stores/psql'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'
import { collectPlanNodes } from '../plan-nodes.mts'

const ALLOWED_INDEXES = new Map<string, readonly string[]>([
  ['classifier-human-vote-comparison-classifier', ['idx_classifier_decision_batches__classifier']],
  [
    'classifier-human-vote-comparison-community',
    ['idx_classifier_decision_batches__scope', 'idx_classifier_decision_batches__classifier'],
  ],
  [
    'classifier-human-vote-comparison-post',
    ['idx_classifier_decision_batches__post', 'idx_classifier_decision_batches__classifier'],
  ],
  [
    'classifier-human-vote-comparison-rss-feed-item',
    [
      'idx_classifier_decision_batches__rss_feed_item',
      'idx_classifier_decision_batches__classifier',
    ],
  ],
])

export function assertClassifierHumanVoteComparisonPlanIfApplicable(result: ExplainResult): void {
  const allowed = ALLOWED_INDEXES.get(result.scenario_id ?? '')
  if (!allowed) return
  const scans = collectPlanNodes(result.plan).filter(
    node => node['Relation Name'] === 'classifier_decision_batches' && node['Alias'] === 'batch',
  )
  const invalid = scans.find(scan => !batchScanIsBounded(scan, allowed))
  if (scans.length === 0 || invalid) {
    throw new Error(`${result.name} must bound the classifier decision batch scan by the id window`)
  }
}

function batchScanIsBounded(
  scan: Record<string, unknown>,
  allowedIndexes: readonly string[],
): boolean {
  const condition = stringFromUnknown(scan['Index Cond'] ?? '')
  return (
    scan['Node Type'] === 'Index Scan' &&
    allowedIndexes.includes(String(scan['Index Name'])) &&
    /\bid >= /.test(condition) &&
    /\bid < /.test(condition)
  )
}
