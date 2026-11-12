import type { ExplainResult } from '@data-stores/psql'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'
import { baseRelationName, collectPlanNodes, processedRows, type PlanNode } from '../plan-nodes.mts'

/** Guard analyzed canonical plans against flattened or unkeyed eligibility work. */
export function assertTopicMetricsEligibilityProbes(result: ExplainResult): void {
  const scans = collectPlanNodes(result.plan).filter(isEligibilityPost)
  if (
    !scans.some(node => alias(node).startsWith('candidate_post')) ||
    !scans.some(node => alias(node).startsWith('root_post'))
  ) {
    throw new Error(`${result.name} must retain candidate and root eligibility point probes`)
  }
  checkTree(result.plan, [], result.name)
}

function alias(node: PlanNode): string {
  return stringFromUnknown(node['Alias'] ?? '')
}

function isEligibilityPost(node: PlanNode): boolean {
  return (
    baseRelationName(node) === 'posts' &&
    (alias(node).startsWith('candidate_post') || alias(node).startsWith('root_post'))
  )
}

function checkTree(value: unknown, ancestors: PlanNode[], name: string): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return
  const node = value as PlanNode
  if (isEligibilityPost(node)) {
    const scalarLimit = ancestors.findLast(parent => parent['Parent Relationship'] === 'SubPlan')
    const condition = stringFromUnknown(node['Index Cond'] ?? '')
    const keyed =
      condition.includes('id =') &&
      (alias(node).startsWith('root_post')
        ? condition.includes('COALESCE(')
        : condition.includes('.subject_id') || condition.includes('.post_id'))
    if (
      scalarLimit?.['Node Type'] !== 'Limit' ||
      !(Number(scalarLimit['Plan Rows']) <= 1) ||
      Number(scalarLimit['Actual Rows'] ?? 0) > 1 ||
      !keyed ||
      processedRows(node) > Number(node['Actual Loops'] ?? 1)
    ) {
      throw new Error(`${name} must resolve eligibility within a scalar candidate/root id probe`)
    }
  }
  if (Array.isArray(node['Plans'])) {
    for (const child of node['Plans']) checkTree(child, [...ancestors, node], name)
  }
  checkTree(node['Plan'], ancestors, name)
}
