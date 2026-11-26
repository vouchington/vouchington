import type { TransactionQuery } from '@data-stores/psql'

/** Only page-sized alias rows leave the source index; accumulated history stays one JSON document. */
export async function snapshotTopicMergeAliases(
  query: TransactionQuery,
  operationId: string,
  sourceId: string,
  destinationId: string,
  sourceSlug: string,
  phase: 0 | 1 | 4,
  cursorAlias: string | null,
  limit: number,
): Promise<{ cursorAlias: string | null; done: boolean }> {
  const sourceSnapshot = phase === 1
  const parameters = [
    operationId,
    sourceSnapshot ? sourceId : destinationId,
    sourceSlug,
    sourceSnapshot,
    limit,
    phase,
  ]
  const afterAlias = cursorAlias === null ? '' : 'AND alias > $7::text'
  const afterSourceSlug = cursorAlias === null ? '' : 'AND $3::text > $7::text'
  if (cursorAlias !== null) parameters.push(cursorAlias)
  const { rows } = await query<{ alias: string }>(
    `/* snapshotTopicMergeAliases */ WITH source_page AS MATERIALIZED (
      SELECT id, alias FROM topic_aliases
      WHERE topic_id = $2::uuid ${afterAlias}
        AND (NOT $4::boolean OR alias <> $3::text)
      ORDER BY alias LIMIT $5::integer
    ), page AS MATERIALIZED (
      SELECT id, alias FROM (
        SELECT id, alias FROM source_page
        UNION ALL
        SELECT NULL::uuid AS id, $3::text AS alias WHERE $4::boolean ${afterSourceSlug}
      ) candidates ORDER BY alias LIMIT $5::integer
    ), retained_aliases AS (
      INSERT INTO topic_merge_operation_aliases (operation_id, alias_id)
      SELECT $1::uuid, id FROM page
      WHERE id IS NOT NULL AND $6::integer = 0
      ORDER BY id
      ON CONFLICT (operation_id, alias_id) DO NOTHING RETURNING alias_id
    ), snapshot_update AS (
      UPDATE topic_merge_operations SET
        source_aliases_before = CASE WHEN $6::integer = 1 THEN source_aliases_before ||
          COALESCE((SELECT JSONB_AGG(alias ORDER BY alias) FROM page), '[]'::jsonb) ELSE source_aliases_before END,
        destination_aliases_before = CASE WHEN $6::integer = 0 THEN destination_aliases_before ||
          COALESCE((SELECT JSONB_AGG(alias ORDER BY alias) FROM page), '[]'::jsonb) ELSE destination_aliases_before END,
        destination_aliases_after = CASE WHEN $6::integer = 4 THEN destination_aliases_after ||
          COALESCE((SELECT JSONB_AGG(alias ORDER BY alias) FROM page), '[]'::jsonb) ELSE destination_aliases_after END
      WHERE id = $1::uuid RETURNING id
    ) SELECT alias FROM page ORDER BY alias`,
    parameters,
  )
  return { cursorAlias: rows.at(-1)?.alias ?? cursorAlias, done: rows.length < limit }
}

/** Both complete revision documents are copied from one operation row, with no alias-table rescan. */
export async function writeTopicMergeAliasRevisions(
  query: TransactionQuery,
  operationId: string,
  mergerId: string,
): Promise<void> {
  await query(
    `/* writeTopicMergeAliasRevisions */ WITH actor AS (
      SELECT COALESCE(JSONB_AGG(role.slug), '[]'::jsonb) AS roles
      FROM user_roles assigned JOIN user_role_types role ON role.id = assigned.role_type_id
      WHERE assigned.user_id = $2::uuid
    )
    INSERT INTO topic_revisions (topic_id, revision_type, revised_by_id, changes)
      SELECT snapshot.topic_id, 'update', live_actor.id,
        JSONB_BUILD_OBJECT('revised_by_roles', actor.roles, 'changes',
          JSONB_BUILD_OBJECT('topic_aliases', JSONB_BUILD_OBJECT('before', snapshot.before, 'after', snapshot.after)))
      FROM topic_merge_operations operation CROSS JOIN actor
      LEFT JOIN users live_actor ON live_actor.id = $2::uuid AND live_actor.deleted_at IS NULL
      CROSS JOIN LATERAL (VALUES
        (operation.source_topic_id, operation.source_aliases_before, '[]'::jsonb),
        (operation.destination_topic_id, operation.destination_aliases_before, operation.destination_aliases_after)
      ) snapshot(topic_id, before, after)
      WHERE operation.id = $1::uuid`,
    [operationId, mergerId],
  )
}
