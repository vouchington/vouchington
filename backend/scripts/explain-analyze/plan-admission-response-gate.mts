import type { ExplainResult } from '@data-stores/psql'

const COMMITTED_POST_INDEX = 'idx_post_admission_reservations__committed_post_retention'

export function assertCommittedAdmissionResponsePlanShapeIfApplicable(result: ExplainResult): void {
  if (result.scenario_id !== 'post-admission-response-refresh') return
  const nodes = collectPlanNodes(result.plan)
  const usesCommittedPostIndex = nodes.some(node => node['Index Name'] === COMMITTED_POST_INDEX)
  const scansAdmissionReservations = nodes.some(
    node =>
      node['Node Type'] === 'Seq Scan' && node['Relation Name'] === 'post_admission_reservations',
  )
  if (!usesCommittedPostIndex || scansAdmissionReservations) {
    throw new Error(
      `${result.name} must update committed admission responses through ${COMMITTED_POST_INDEX} without a post_admission_reservations sequential scan`,
    )
  }
}

type PlanNode = Record<string, unknown>

function collectPlanNodes(value: unknown, nodes: PlanNode[] = []): PlanNode[] {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return nodes
  const node = value as PlanNode
  if (typeof node['Node Type'] === 'string') nodes.push(node)
  const plans = node['Plans']
  if (Array.isArray(plans)) {
    for (const child of plans) collectPlanNodes(child, nodes)
  }
  collectPlanNodes(node['Plan'], nodes)
  return nodes
}
