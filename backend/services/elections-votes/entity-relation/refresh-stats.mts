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
    table => `SELECT id, '${table}'::text AS entity_relation
      FROM "${table}"
      WHERE id = $1 AND deleted_at IS NULL`,
  )
  const { rows } = await write(
    `/* refreshEntityRelationVoteStatsById */
    ${tableUnions.join('\n    UNION ALL\n    ')}
    LIMIT 1`,
    [relationId],
  )
  const relation = rows[0] as { id?: string; entity_relation?: string } | undefined
  if (!relation?.id || !relation.entity_relation) return
  await refreshEntityRelationVoteStatsFromPrimaryWithFallback(
    createEntityRelationElectionTarget(relation.id, relation.entity_relation),
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
  } catch (outerErr) {
    try {
      await dependencies.enqueueReconciliation([target])
    } catch (err) {
      throw new Error(
        `Primary entity-relation vote refresh failed (${outerErr instanceof Error ? outerErr.message : String(outerErr)}) and fallback enqueue also failed`,
        { cause: err },
      )
    }
  }
}
