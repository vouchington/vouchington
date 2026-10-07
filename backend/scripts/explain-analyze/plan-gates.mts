import type { ExplainResult } from '@data-stores/psql'
import {
  PARTITION_POLICIES,
  UNBOUNDED_UNPARTITIONED_TABLES,
} from '@data-stores/psql/schema-growth-registry'
import { collectPlanNodes, processedRows, baseRelationName, type PlanNode } from './plan-nodes.mts'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'
import { executingPartitionLeaves } from './pruning/plan-gate.mts'
import {
  getScenarioContract,
  type PlanExpectation,
  type ScenarioPlanContract,
} from './plan-expectations.mts'
import { assertCustomPlanCheck } from './plan-custom-checks.mts'

/** Above the current ~102k-post fixture; larger unbounded fixtures must use indexes. */
export const SEQUENTIAL_SCAN_SEEDED_ROW_THRESHOLD = 150_000

export function assertRequiredPlanShape(result: ExplainResult): void {
  const scenarioId = result.scenario_id
  if (!scenarioId) throw new Error('Unknown EXPLAIN scenario: missing')
  const contract = getScenarioContract(scenarioId)
  const nodes = collectPlanNodes(result.plan)
  const root = nodes[0]
  if (typeof root?.['Actual Rows'] !== 'number' || root['Actual Rows'] <= 0)
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
    case 'usesIndexes': {
      if (expectation.queryContains && !result.query_text.includes(expectation.queryContains))
        return
      const missing = expectation.indexes.filter(
        index => !nodes.some(node => node['Index Name'] === index),
      )
      if (
        missing.length ||
        (expectation.noSort &&
          nodes.some(node => stringFromUnknown(node['Node Type']).includes('Sort')))
      )
        throw new Error(
          `${result.name} must use index(es) ${expectation.indexes.join(', ')}${expectation.noSort ? ' without an explicit Sort' : ''}`,
        )
      return
    }
    case 'queryBinds':
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

function assertUniversalPlanShape(
  result: ExplainResult,
  nodes: readonly PlanNode[],
  contract: ScenarioPlanContract,
): void {
  for (const [parent] of PARTITION_POLICIES) {
    const leaves = nodes
      .filter(node => baseRelationName(node) === parent)
      .map(node => stringFromUnknown(node['Relation Name'] ?? ''))
    if (leaves.length === 0) continue
    const executed = executingPartitionLeaves(
      result.plan as Parameters<typeof executingPartitionLeaves>[0],
      leaves,
    )
    if (executed.length > 1 && !contract.crossPartition?.[parent])
      throw new Error(
        `${result.name} read ${executed.length} leaves of unbounded ${parent} without crossPartition reason`,
      )
  }
  for (const node of nodes) {
    const relation = baseRelationName(node)
    if (
      node['Node Type'] !== 'Seq Scan' ||
      processedRows(node) === 0 ||
      !(PARTITION_POLICIES.has(relation) || UNBOUNDED_UNPARTITIONED_TABLES.has(relation))
    )
      continue
    const seededRows = contract.seededRows?.[relation]
    if (seededRows === undefined)
      throw new Error(
        `${result.name} sequentially scanned unbounded ${relation} without a declared seeded row count`,
      )
    if (seededRows > SEQUENTIAL_SCAN_SEEDED_ROW_THRESHOLD)
      throw new Error(
        `${result.name} sequentially scanned ${relation} with ${seededRows} seeded rows`,
      )
  }
}
