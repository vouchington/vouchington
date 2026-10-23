import type { TransactionQuery } from '@data-stores/psql'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { getTopicsWorkLimit } from './work-limits.mts'

/** Walk only indexed outgoing parent edges. A depth overflow rejects the merge as a cycle risk. */
export async function assertTopicMergeParentCompatibility(
  query: TransactionQuery,
  sourceTopicId: string,
  destinationTopicId: string,
  { lockAncestors = false }: { lockAncestors?: boolean } = {},
): Promise<void> {
  const inspect = async () =>
    query<{ conflict: boolean; ancestor_ids: string[] }>(
      `/* assertTopicMergeParentCompatibility */
      WITH RECURSIVE ancestors(id, depth) AS (
        SELECT edge.object_id, 1
        FROM relation__topic__parent__topic edge
        WHERE edge.subject_id = ANY(ARRAY[$1::uuid, $2::uuid])
          AND edge.object_id <> ALL(ARRAY[$1::uuid, $2::uuid])
          AND edge.deleted_at IS NULL
        UNION
        SELECT CASE WHEN edge.object_id = $1::uuid THEN $2::uuid ELSE edge.object_id END,
          ancestors.depth + 1
        FROM ancestors CROSS JOIN LATERAL (
          WITH outgoing AS MATERIALIZED (
            SELECT object_id FROM relation__topic__parent__topic edge
            WHERE edge.subject_id = ancestors.id AND edge.deleted_at IS NULL
          )
          SELECT object_id FROM outgoing
        ) edge
        WHERE ancestors.id <> $2::uuid AND ancestors.depth < $3::integer
          AND edge.object_id <> ancestors.id
      )
      SELECT ARRAY(SELECT DISTINCT id FROM ancestors ORDER BY id) AS ancestor_ids,
        EXISTS (SELECT 1 FROM ancestors WHERE id = $2::uuid)
        OR EXISTS (
          SELECT 1 FROM ancestors a JOIN relation__topic__parent__topic edge ON edge.subject_id = a.id
          WHERE a.depth = $3::integer AND a.id <> $2::uuid
            AND edge.deleted_at IS NULL AND edge.object_id <> a.id
        ) AS conflict`,
      [sourceTopicId, destinationTopicId, getTopicsWorkLimit('parent_merge_cycle_max_depth')],
    )
  const first = (await inspect()).rows[0]!
  if (first.conflict) throwParentCycle(sourceTopicId, destinationTopicId)
  if (!lockAncestors || first.ancestor_ids.length === 0) return

  // Parent-edge insertion takes FK KEY SHARE locks on its endpoints. Holding UPDATE locks on
  // every current ancestor prevents another edge from extending this walk before commit.
  await query(
    `/* lockTopicMergeParentAncestors */
      SELECT id
      -- no-mistakes-disable-next-line postgres-required-predicates: parent edges may reach inactive topic identities; all ancestors need a row lock to serialize edge insertion.
      FROM topics WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
    [first.ancestor_ids],
  )
  // A writer can commit a new edge between the first read and these locks. Reject any new
  // ancestor, including a harmless one: it was not locked and could change again before commit.
  const second = (await inspect()).rows[0]!
  const lockedIds = new Set(first.ancestor_ids)
  if (second.conflict || second.ancestor_ids.some(id => !lockedIds.has(id)))
    throwParentCycle(sourceTopicId, destinationTopicId)
}

function throwParentCycle(sourceTopicId: string, destinationTopicId: string): never {
  throw Object.assign(
    createCodedError(
      409,
      'Cannot merge topics with a parent cycle or ancestry beyond the configured depth',
      'topic_merge_parent_cycle',
    ),
    { source_id: sourceTopicId, destination_id: destinationTopicId },
  )
}
