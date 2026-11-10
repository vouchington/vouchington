import type { ExplainResult } from '@data-stores/psql'
import {
  collectPlanNodes,
  planNodeUsesIndex,
  processedRows,
  sequentiallyScanned,
  baseRelationName,
  type PlanNode,
} from './plan-nodes.mts'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'
import { executingPartitionLeaves } from './pruning/plan-gate.mts'
import { getScenarioContract, type PlanExpectation } from './plan-expectations.mts'
import { assertCustomPlanCheck } from './plan-custom-checks.mts'
import { assertFunctionCallCap } from './plan-function-calls.mts'
import { assertUniversalPlanShape } from './plan-universal-shape.mts'
export { assertScenarioFunctionCalls } from './plan-function-calls.mts'

export function assertRequiredPlanShape(result: ExplainResult): void {
  const scenarioId = result.scenario_id
  if (!scenarioId) throw new Error('Unknown EXPLAIN scenario: missing')
  const contract = getScenarioContract(scenarioId)
  const nodes = collectPlanNodes(result.plan)
  const root = nodes[0]
  const replayEventInsert =
    scenarioId.startsWith('media-delivery-replay-') &&
    result.query_text.includes('replayFailedMediaDeliveryRegistryRecords:event') &&
    root?.['Node Type'] === 'ModifyTable' &&
    root['Operation'] === 'Insert' &&
    nodes.slice(1).some(node => Number(node['Actual Rows']) > 0)
  if (
    !contract.allowEmptyResult &&
    !replayEventInsert &&
    (typeof root?.['Actual Rows'] !== 'number' || root['Actual Rows'] <= 0)
  )
    throw new Error(`${result.name} (${scenarioId}) produced no analyzable plan with real rows`)
  for (const expectation of contract.expectations) evaluateExpectation(result, nodes, expectation)
  if (result.query_text.includes('view_rss_feed_current_states'))
    assertCustomPlanCheck('rssStateProjection', result)
  assertUniversalPlanShape(result, nodes, contract)
}

function evaluateExpectation(
  result: ExplainResult,
  nodes: readonly PlanNode[],
  expectation: PlanExpectation,
): void {
  switch (expectation.kind) {
    case 'maxProcessedRows': {
      const total = nodes
        .filter(node => baseRelationName(node) === expectation.relation)
        .reduce((sum, node) => sum + processedRows(node), 0)
      if (total > expectation.max)
        throw new Error(
          `${result.name} processed ${total} rows from ${expectation.relation}; expected at most ${expectation.max}`,
        )
      return
    }
    case 'maxBitmapIndexRows': {
      // Bitmap Index Scan nodes have no Relation Name, so maxProcessedRows on a table misses
      // a broad index read whose bitmap heap intersection ultimately returns only one row.
      const total = nodes
        .filter(node => node['Node Type'] === 'Bitmap Index Scan')
        .reduce((sum, node) => sum + processedRows(node), 0)
      if (total > expectation.max)
        throw new Error(
          `${result.name} processed ${total} bitmap index entries; expected at most ${expectation.max}`,
        )
      return
    }
    case 'noSeqScan': {
      if (expectation.queryContains && !result.query_text.includes(expectation.queryContains))
        return
      if (sequentiallyScanned(nodes, expectation.relation))
        throw new Error(`${result.name} sequentially scanned ${expectation.relation}`)
      return
    }
    case 'usesIndexes': {
      if (expectation.queryContains && !result.query_text.includes(expectation.queryContains))
        return
      const used = (index: string) => nodes.some(node => planNodeUsesIndex(node, index))
      const missing = expectation.anyOf
        ? expectation.indexes.some(used)
          ? []
          : expectation.indexes
        : expectation.indexes.filter(index => !used(index))
      if (
        missing.length ||
        (expectation.noSort &&
          nodes.some(node => stringFromUnknown(node['Node Type']).includes('Sort')))
      )
        throw new Error(
          `${result.name} must use ${expectation.anyOf ? 'one of index(es)' : 'index(es)'} ${expectation.indexes.join(', ')}${expectation.noSort ? ' without an explicit Sort' : ''}`,
        )
      return
    }
    case 'queryBinds':
      if (expectation.queryContains && !result.query_text.includes(expectation.queryContains))
        return
      if (!new RegExp(String.raw`\b${expectation.token}\b`).test(result.query_text))
        throw new Error(`${result.name} must constrain the query through ${expectation.token}`)
      return
    case 'forbidCorrelatedAggregates':
      if (
        nodes.some(
          node =>
            stringFromUnknown(node['Subplan Name'] ?? '').startsWith('SubPlan') &&
            stringFromUnknown(node['Node Type']).includes('Aggregate'),
        )
      )
        throw new Error(`${result.name} must not execute correlated aggregate SubPlans`)
      return
    case 'singleLeaf':
      assertSingleLeaf(result, nodes, expectation.parent, expectation.key)
      return
    case 'maxFunctionCalls': {
      assertFunctionCallCap(result, expectation)
      return
    }
    case 'custom':
      assertCustomPlanCheck(expectation.name, result)
      return
    default:
      throw new Error(`Unknown plan expectation kind: ${(expectation as { kind: string }).kind}`)
  }
}

function assertSingleLeaf(
  result: ExplainResult,
  nodes: readonly PlanNode[],
  parent: string,
  key?: string,
): void {
  const leaves = nodes
    .filter(node => baseRelationName(node) === parent)
    .map(node => stringFromUnknown(node['Relation Name'] ?? ''))
  const executed = executingPartitionLeaves(
    result.plan as Parameters<typeof executingPartitionLeaves>[0],
    leaves,
  )
  if ((key && !new RegExp(String.raw`\b${key}\b`).test(result.query_text)) || executed.length !== 1)
    throw new Error(
      `${result.name} must constrain ${parent}${key ? `.${key}` : ''} and execute exactly one partition leaf; observed [${executed.join(', ')}]`,
    )
}
