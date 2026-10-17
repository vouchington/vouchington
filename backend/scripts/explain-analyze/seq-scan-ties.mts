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
export type ProbedExplainResult = ExplainResult & {
  no_seq_scan_total_cost?: number
  /** Baselined relations absent from the plan, each priced plan-only with index scans disabled. */
  forced_seq_scans?: Readonly<Record<string, ForcedSeqScan>>
}

/** The forced plan's total cost and the cost of its sequential scan nodes on one relation. */
export type ForcedSeqScan = { total_cost: number; scan_cost: number }

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

function seqScanCost(plan: unknown, relation?: string): number {
  return collectNodes(plan).reduce(
    (sum, node) =>
      node.seqScan &&
      node.relationName &&
      isLargeTable(node.relationName) &&
      (relation === undefined || parentRelationName(node.relationName) === relation)
        ? sum + node.cost
        : sum,
    0,
  )
}

/**
 * The forced plan's costs, only when it really sequentially scans `relation`. A forced plan that
 * keeps no scan of it (an index-only path the planner still found, or a rewritten statement)
 * proves nothing about the baselined scan.
 */
export function forcedSeqScan(probePlan: unknown, relation: string): ForcedSeqScan | undefined {
  const scanCost = seqScanCost(probePlan, relation)
  const totalCost = planTotalCost(probePlan)
  return scanCost > 0 && totalCost !== undefined
    ? { total_cost: totalCost, scan_cost: scanCost }
    : undefined
}

/**
 * A baselined scan the planner no longer chose is a near-tie, not a fix, when forcing it back
 * costs at most SEQ_SCAN_TIE_RATIO of that scan more than the chosen plan.
 */
export function isStaleSeqScanNearTie(result: ProbedExplainResult, relation: string): boolean {
  const forced = result.forced_seq_scans?.[relation]
  const chosen = planTotalCost(result.plan)
  if (forced === undefined || chosen === undefined) return false
  return forced.total_cost - chosen <= forced.scan_cost * SEQ_SCAN_TIE_RATIO
}

export function isSeqScanNearTie(result: ProbedExplainResult): boolean {
  const withoutSeqScan = result.no_seq_scan_total_cost
  const withSeqScan = planTotalCost(result.plan)
  const scanCost = seqScanCost(result.plan)
  if (withoutSeqScan === undefined || withSeqScan === undefined || scanCost === 0) return false
  return withoutSeqScan - withSeqScan <= scanCost * SEQ_SCAN_TIE_RATIO
}
