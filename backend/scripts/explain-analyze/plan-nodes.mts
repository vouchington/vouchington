import { PARTITION_POLICIES } from '@data-stores/psql/schema-growth-registry'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'

export type PlanNode = Record<string, unknown>

/** Physical rows touched by one scan, including rows rejected by its predicates. */
export function processedRows(node: PlanNode): number {
  return (
    (Number(node['Actual Rows'] ?? 0) +
      Number(node['Rows Removed by Filter'] ?? 0) +
      Number(node['Rows Removed by Index Recheck'] ?? 0)) *
    Number(node['Actual Loops'] ?? 1)
  )
}

export function collectPlanNodes(value: unknown, nodes: PlanNode[] = []): PlanNode[] {
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

const partitionParents = [...PARTITION_POLICIES.keys()].toSorted((a, b) => b.length - a.length)

export function planNodeUsesIndex(node: PlanNode, index: string): boolean {
  if (node['Index Name'] === index) return true
  const arbiters = node['Conflict Arbiter Indexes']
  return Array.isArray(arbiters) && arbiters.includes(index)
}

export function baseRelationName(node: PlanNode): string {
  const name = stringFromUnknown(node['Relation Name'] ?? '')
  for (const parent of partitionParents)
    if (name === parent || name.startsWith(`${parent}__`) || name.startsWith(`${parent}_default`))
      return parent
  return name
}

/** A scan that touched rows, including rows a filter rejected. An unexecuted scan did no work. */
export function sequentiallyScanned(nodes: readonly PlanNode[], relation: string): boolean {
  return nodes.some(
    node =>
      node['Node Type'] === 'Seq Scan' &&
      baseRelationName(node) === relation &&
      processedRows(node) > 0,
  )
}
