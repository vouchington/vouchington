import type { ExplainResult } from '@data-stores/psql'
import { collectPlanNodes, processedRows } from '../plan-nodes.mts'

/** Generic plans must keep the ordered pending-evidence page independent of other providers. */
export function assertAppleNotificationRecoveryPlan(result: ExplainResult): void {
  if (result.plan_cache_mode !== 'force_generic_plan') return
  const candidate = collectPlanNodes(result.plan).find(
    node => node['Subplan Name'] === 'CTE candidate_page',
  )
  const nodes = collectPlanNodes(candidate)
  const evidence = nodes.filter(
    node => node['Relation Name'] === 'membership_provider_evidence_records',
  )
  if (
    candidate?.['Node Type'] !== 'Limit' ||
    nodes.some(node => String(node['Node Type']).includes('Sort')) ||
    !nodes.some(
      node =>
        node['Index Name'] === 'idx_membership_provider_evidence_records__pending_received_at',
    ) ||
    evidence.reduce((sum, node) => sum + processedRows(node), 0) > 1_500
  ) {
    throw new Error(`${result.name} must use a bounded ordered pending-evidence index page`)
  }
}
