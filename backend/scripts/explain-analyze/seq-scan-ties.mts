import type { ExplainResult } from '@data-stores/psql'
import { collectNodes } from './plan-node-stats.mts'
import { isLargeTable, parentRelationName } from './plan-warnings.mts'

/**
 * A sequential scan is a near-tie when avoiding every sequential scan raises the statement's
 * planned cost by at most this fraction of the scans' own cost. The planner then has an index
 * alternative it prices almost the same, so the choice can flip between databases. Merge-group
 * run 38992808434 priced the same `posts` sequential scan at 10676 in one CI database and 12208 in
 * another, a 14% drift; locally the bitmap alternative priced 11262 against a 11304 sequential scan.
 * 25% covers that drift. A clearly better index costs far more than a quarter of the scan.
 */
export const SEQ_SCAN_TIE_RATIO = 0.25

/** `no_seq_scan_total_cost` is the plan-only cost with `enable_seqscan = off`, set at capture. */
export type ProbedExplainResult = ExplainResult & { no_seq_scan_total_cost?: number }

export function planTotalCost(plan: unknown): number | undefined {
  if (plan == null || typeof plan !== 'object' || Array.isArray(plan)) return undefined
  const root = (plan as Record<string, unknown>)['Plan']
  if (root == null || typeof root !== 'object') return undefined
  const cost = (root as Record<string, unknown>)['Total Cost']
  return typeof cost === 'number' ? cost : undefined
}

/**
 * The probe plan's total cost, only when it really avoids a sequential scan of every relation in
 * `scannedRelations`. With no usable index the probe keeps the (disabled) sequential scan at the
 * same cost, which would otherwise read as a tie and hide a missing index.
 */
export function costWithoutSeqScan(
  probePlan: unknown,
  scannedRelations: readonly string[],
): number | undefined {
  const stillScanned = new Set(
    collectNodes(probePlan).flatMap(node =>
      node.seqScan && node.relationName && isLargeTable(node.relationName)
        ? [parentRelationName(node.relationName)]
        : [],
    ),
  )
  if (scannedRelations.some(relation => stillScanned.has(relation))) return undefined
  return planTotalCost(probePlan)
}

function seqScanCost(plan: unknown): number {
  return collectNodes(plan).reduce(
    (sum, node) =>
      node.seqScan && node.relationName && isLargeTable(node.relationName) ? sum + node.cost : sum,
    0,
  )
}

export function isSeqScanNearTie(result: ProbedExplainResult): boolean {
  const withoutSeqScan = result.no_seq_scan_total_cost
  const withSeqScan = planTotalCost(result.plan)
  const scanCost = seqScanCost(result.plan)
  if (withoutSeqScan === undefined || withSeqScan === undefined || scanCost === 0) return false
  return withoutSeqScan - withSeqScan <= scanCost * SEQ_SCAN_TIE_RATIO
}
