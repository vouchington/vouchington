import type { HostnameBlockCleanupOperation } from './cleanup-operation.mts'

type HostnameBlockOperationTotals = {
  blocked_hostname_count: number
  soft_deleted_relation_count: number
  penalized_user_count: number
}

export type HostnameBlockOperationResult = { operation_id: string } & (
  | { status: 'pending'; totals: null }
  | { status: 'completed'; totals: HostnameBlockOperationTotals }
)

export function toHostnameBlockOperationResult(
  operation: HostnameBlockCleanupOperation,
): HostnameBlockOperationResult {
  if (!operation.completedAt) {
    return { operation_id: operation.blockId, status: 'pending', totals: null }
  }
  return {
    operation_id: operation.blockId,
    status: 'completed',
    totals: {
      blocked_hostname_count: operation.blockedHostnameCount,
      soft_deleted_relation_count: operation.softDeletedRelationCount,
      penalized_user_count: operation.penalizedUserCount,
    },
  }
}
