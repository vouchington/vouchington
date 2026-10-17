import type { ExplainResult } from '@data-stores/psql'
import type { PlanNode } from './plan-nodes.mts'
import type { PlanExpectation } from './plan-expectations.mts'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'

type UsesAnyIndexExpectation = Extract<PlanExpectation, { kind: 'usesAnyIndex' }>

export function assertUsesAnyIndex(
  result: ExplainResult,
  nodes: readonly PlanNode[],
  expectation: UsesAnyIndexExpectation,
): void {
  if (expectation.queryContains && !result.query_text.includes(expectation.queryContains)) return

  const found = expectation.indexes.some(index => nodes.some(node => node['Index Name'] === index))
  const sorted =
    expectation.noSort && nodes.some(node => stringFromUnknown(node['Node Type']).includes('Sort'))
  if (found && !sorted) return

  throw new Error(
    `${result.name} must use one of index(es) ${expectation.indexes.join(', ')}${expectation.noSort ? ' without an explicit Sort' : ''}`,
  )
}
