import { type ExplainResult, type PlanNode, processedRows } from '@vouchington/explain-plan'
import type { PlanExpectation } from './plan-expectations.mts'

type MaxInputRows = Extract<PlanExpectation, { kind: 'maxInputRows' }>

export function assertMaxInputRows(
  result: ExplainResult,
  nodes: readonly PlanNode[],
  expectation: MaxInputRows,
): void {
  if (expectation.captureIndex !== undefined && result.capture_index !== expectation.captureIndex)
    return
  const total =
    expectation.nodeType === 'Sort'
      ? nodes
          .filter(node => node['Node Type'] === 'Sort' || node['Node Type'] === 'Incremental Sort')
          .reduce((sum, node) => sum + sortInputRows(result.name, node), 0)
      : nodes
          .filter(node => node['Node Type'] === expectation.nodeType)
          .reduce((sum, node) => sum + processedRows(node), 0)
  if (total > expectation.max)
    throw new Error(
      `${result.name} processed ${total} ${expectation.nodeType} input rows; expected at most ${expectation.max}`,
    )
}

// A top-N sort can emit fewer rows than it reads. Count only rows delivered by its outer input.
function sortInputRows(queryName: string, node: PlanNode): number {
  if (node['Actual Loops'] === 0) return 0
  const children = Array.isArray(node.Plans) ? (node.Plans as PlanNode[]) : []
  const input = children.find(child => child['Parent Relationship'] === 'Outer')
  const rows = Number(input?.['Actual Rows']) * Number(input?.['Actual Loops'])
  if (!Number.isFinite(rows))
    throw new Error(`${queryName} must expose measured rows for the outer input of each sort`)
  return rows
}
