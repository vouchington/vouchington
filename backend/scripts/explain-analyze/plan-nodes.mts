import {
  baseRelationName as resolvedRelationName,
  createPartitionResolver,
  sequentiallyScanned as scanned,
  type PlanNode,
} from '@vouchington/explain-plan'
import { PARTITION_POLICIES } from '@data-stores/psql/schema-growth-registry'

const resolvePartition = createPartitionResolver(PARTITION_POLICIES.keys())

/** The partitioned parent a plan node's relation belongs to, from the schema growth registry. */
export function baseRelationName(node: PlanNode): string {
  return resolvedRelationName(node, resolvePartition)
}

export function sequentiallyScanned(nodes: readonly PlanNode[], relation: string): boolean {
  return scanned(nodes, relation, resolvePartition)
}
