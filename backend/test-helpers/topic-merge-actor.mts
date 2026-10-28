import { write } from '@data-stores/psql'

export async function getPurgedTopicMergeActorState(operationId: string, alias: string) {
  const { rows } = await write<{
    completed_at: Date | null
    merged_by_id: string | null
    updated_by_id: string | null
    alias_topic_id: string | null
    revised_by_id: string | null
  }>(
    `/* getPurgedMergeActorState */ SELECT operation.completed_at, source.merged_by_id,
      source.updated_by_id, alias.topic_id AS alias_topic_id,
      revision.revised_by_id
    FROM topic_merge_operations operation
    JOIN topics source ON source.id = operation.source_topic_id
    JOIN topic_aliases alias ON alias.alias = $2
    JOIN LATERAL (
      SELECT revised_by_id FROM topic_revisions WHERE topic_id = source.id
      ORDER BY id DESC LIMIT 1
    ) revision ON TRUE
    WHERE operation.id = $1::uuid`,
    [operationId, alias],
  )
  return rows[0]
}
