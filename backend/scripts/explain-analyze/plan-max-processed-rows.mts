import { type ExplainResult, type PlanNode, processedRows } from '@vouchington/explain-plan'
import { baseRelationName } from './plan-nodes.mts'
import type { PlanExpectation } from './plan-expectations.mts'

type MaxProcessedRows = Extract<PlanExpectation, { kind: 'maxProcessedRows' }>

/** Caps the rows read from one relation, optionally only in the capture at `captureIndex`. */
export function assertMaxProcessedRows(
  result: ExplainResult,
  nodes: readonly PlanNode[],
  expectation: MaxProcessedRows,
): void {
  if (expectation.captureIndex !== undefined && result.capture_index !== expectation.captureIndex)
    return
  const total = nodes
    .filter(node => baseRelationName(node) === expectation.relation)
    .reduce((sum, node) => sum + processedRows(node), 0)
  if (total > expectation.max)
    throw new Error(
      `${result.name} processed ${total} rows from ${expectation.relation}; expected at most ${expectation.max}`,
    )
}
