import type { TransactionQuery } from '@data-stores/psql'
import { lockTopicAliasPublicationScopes } from '@services/post-publication'
import { recordTopicAliasPublicationChanges } from './publication-change.mts'
import {
  snapshotTopicMergeAliases,
  writeTopicMergeAliasRevisions,
} from './merge-aliases-snapshot.mts'

export type TopicMergeAliasPhase = 0 | 1 | 2 | 3 | 4
type AliasRow = { id: string; alias: string; topic_id: string | null }

/** The caller locks the operation and commits the returned position with this page. */
export async function processTopicMergeAliasPage(
  query: TransactionQuery,
  operationId: string,
  sourceId: string,
  destinationId: string,
  mergerId: string,
  sourceSlug: string,
  phase: TopicMergeAliasPhase,
  cursorAlias: string | null,
  limit: number,
): Promise<{ phase: TopicMergeAliasPhase; cursorAlias: string | null; hasMore: boolean }> {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError('Invalid alias page limit')
  if (phase === 0 || phase === 1 || phase === 4) {
    const page = await snapshotTopicMergeAliases(
      query,
      operationId,
      sourceId,
      destinationId,
      sourceSlug,
      phase,
      cursorAlias,
      limit,
    )
    if (phase === 4 && page.done) await writeTopicMergeAliasRevisions(query, operationId, mergerId)
    return { phase, cursorAlias: page.cursorAlias, hasMore: !page.done }
  }
  if (phase === 3) {
    await ensureSourceSlugAlias(query, operationId, sourceId, destinationId, mergerId, sourceSlug)
    return { phase, cursorAlias: null, hasMore: false }
  }
  const { rows } = await query<AliasRow>(
    `/* processTopicMergeAliasPage */ SELECT id, alias, topic_id FROM topic_aliases
      WHERE topic_id = $1::uuid AND ($2::text IS NULL OR alias > $2)
      ORDER BY alias LIMIT $3::integer`,
    [sourceId, cursorAlias, limit],
  )
  const aliasIds = rows.map(row => row.id)
  if (aliasIds.length) {
    await lockTopicAliasPublicationScopes(query, aliasIds)
    await captureAndMoveAliases(query, operationId, rows, destinationId, mergerId)
  }
  return { phase, cursorAlias: rows.at(-1)?.alias ?? cursorAlias, hasMore: rows.length === limit }
}

async function captureAndMoveAliases(
  query: TransactionQuery,
  operationId: string,
  rows: AliasRow[],
  destinationId: string,
  mergerId: string,
) {
  await recordTopicAliasPublicationChanges(
    query,
    rows.map(row => ({
      aliasId: row.id,
      alias: row.alias,
      previousTopicId: row.topic_id,
      nextTopicId: destinationId,
    })),
  )
  await moveAndRetainAliases(
    query,
    operationId,
    rows.map(row => row.id),
    destinationId,
    mergerId,
  )
}

async function moveAndRetainAliases(
  query: TransactionQuery,
  operationId: string,
  aliasIds: string[],
  destinationId: string,
  mergerId: string,
) {
  await query(
    `/* processTopicMergeAliasPage move */ UPDATE topic_aliases
      SET topic_id = $1::uuid,
        updated_by_id = (SELECT id FROM users WHERE id = $2::uuid AND deleted_at IS NULL)
      WHERE id = ANY($3::uuid[])`,
    [destinationId, mergerId, aliasIds],
  )
  await retainAliasIds(query, operationId, aliasIds)
}

async function ensureSourceSlugAlias(
  query: TransactionQuery,
  operationId: string,
  sourceId: string,
  destinationId: string,
  mergerId: string,
  sourceSlug: string,
): Promise<void> {
  const { rows: before } = await query<AliasRow>(
    `/* ensureSourceSlugAlias before */ SELECT id, alias, topic_id FROM topic_aliases WHERE alias = $1`,
    [sourceSlug],
  )
  await lockTopicAliasPublicationScopes(
    query,
    before.map(row => row.id),
  )
  const { rows } = await query<AliasRow>(
    `/* ensureSourceSlugAlias */ INSERT INTO topic_aliases (topic_id, alias, created_by_id, updated_by_id)
      VALUES ($1::uuid, $2,
        (SELECT id FROM users WHERE id = $3::uuid AND deleted_at IS NULL),
        (SELECT id FROM users WHERE id = $3::uuid AND deleted_at IS NULL))
      ON CONFLICT (alias) DO UPDATE SET topic_id = EXCLUDED.topic_id, updated_by_id = EXCLUDED.updated_by_id
      WHERE topic_aliases.topic_id IS NULL OR topic_aliases.topic_id = $1::uuid OR topic_aliases.topic_id = $4::uuid
      RETURNING id, alias, topic_id`,
    [destinationId, sourceSlug, mergerId, sourceId],
  )
  if (!rows.length) throw new Error('Reserved source slug has another owner')
  await recordTopicAliasPublicationChanges(
    query,
    rows.map(row => ({
      aliasId: row.id,
      alias: row.alias,
      previousTopicId: before[0]?.topic_id ?? null,
      nextTopicId: destinationId,
    })),
  )
  await retainAliasIds(
    query,
    operationId,
    rows.map(row => row.id),
  )
}

async function retainAliasIds(query: TransactionQuery, operationId: string, aliasIds: string[]) {
  await query(
    `/* retainTopicMergeAliasIds */ INSERT INTO topic_merge_operation_aliases (operation_id, alias_id)
      SELECT $1::uuid, alias.id FROM UNNEST($2::uuid[]) alias(id) ORDER BY alias.id
      ON CONFLICT (operation_id, alias_id) DO NOTHING`,
    [operationId, aliasIds],
  )
}
