import type { ExplainResult } from '@data-stores/psql'
import {
  PARTITION_POLICIES,
  UNBOUNDED_UNPARTITIONED_TABLES,
} from '@data-stores/psql/schema-growth-registry'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'
import { baseRelationName, processedRows, type PlanNode } from './plan-nodes.mts'
import type { ScenarioPlanContract } from './plan-expectations.mts'
import { executingPartitionLeaves } from './pruning/plan-gate.mts'

/** Above the current ~102k-post fixture; larger unbounded fixtures must use indexes. */
const SEQUENTIAL_SCAN_SEEDED_ROW_THRESHOLD = 150_000

export function assertUniversalPlanShape(
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
    if (
      seededRows > SEQUENTIAL_SCAN_SEEDED_ROW_THRESHOLD ||
      contract.forbidSequentialScans?.includes(relation)
    )
      throw new Error(
        `${result.name} sequentially scanned ${relation} with ${seededRows} seeded rows`,
      )
  }
}
