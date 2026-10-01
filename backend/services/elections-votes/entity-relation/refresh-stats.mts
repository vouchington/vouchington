import { enqueueBulkUpdateEntityRelationElectionVoteStats } from '@queues/elections/enqueues'
import { write } from '@data-stores/psql'
import { updateEntityRelationElectionVoteStatsFromPrimary } from './vote-stats.mts'
import type { EntityRelationElectionTarget } from '@queues/elections/types'
import { entityRelationMetadatum } from '@voucha/types/entities/entity-relations-metadata'
import { createEntityRelationElectionTarget } from './target.mts'

const electionRelationTables = entityRelationMetadatum.flatMap(metadata =>
  metadata.election ? [metadata.table_name] : [],
)
export async function refreshEntityRelationVoteStatsFromPrimaryWithFallback(
  target: EntityRelationElectionTarget,
): Promise<void> {
  await refreshEntityRelationVoteStatsWithDependencies(target, {
    refreshFromPrimary: updateEntityRelationElectionVoteStatsFromPrimary,
    enqueueReconciliation: enqueueBulkUpdateEntityRelationElectionVoteStats,
  })
}

export async function refreshEntityRelationVoteStatsById(relationId: string): Promise<void> {
  const tableUnions = electionRelationTables.map(
    table => `SELECT id, '${table}'::text AS relation_table
      FROM "${table}"
      WHERE id = $1 AND deleted_at IS NULL`,
  )
  const { rows } = await write(
    `/* refreshEntityRelationVoteStatsById */
    ${tableUnions.join('\n    UNION ALL\n    ')}
    LIMIT 1`,
    [relationId],
  )
  const relation = rows[0] as { id?: string; relation_table?: string } | undefined
  if (!relation?.id || !relation.relation_table) return
  await refreshEntityRelationVoteStatsFromPrimaryWithFallback(
    createEntityRelationElectionTarget(relation.id, relation.relation_table),
  )
}

type RefreshStatsDependencies = {
  refreshFromPrimary: (target: EntityRelationElectionTarget) => Promise<void>
  enqueueReconciliation: (targets: EntityRelationElectionTarget[]) => unknown | Promise<unknown>
}

export async function refreshEntityRelationVoteStatsWithDependencies(
  target: EntityRelationElectionTarget,
  dependencies: RefreshStatsDependencies,
): Promise<void> {
  try {
    await dependencies.refreshFromPrimary(target)
  } catch (refreshError) {
    try {
      await dependencies.enqueueReconciliation([target])
    } catch (enqueueError) {
      throw new Error(
        `Primary entity-relation vote refresh failed (${refreshError instanceof Error ? refreshError.message : String(refreshError)}) and fallback enqueue also failed`,
        { cause: enqueueError },
      )
    }
  }
}
