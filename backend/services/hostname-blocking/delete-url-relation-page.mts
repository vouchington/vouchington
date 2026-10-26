import { assertWhitelistedSqlIdentifier } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import { recordPostRelatedUrlPublicationChanges } from '@services/entity-relations/post-topic-publication'
import { getEntityRelationUrlTables } from '@services/entity-relations/url-tables'
import { lockPostPublicationPostScopes } from '@services/post-publication'
import sql from 'sql-template-strings'

const POST_RELATED_URL_TABLE = 'relation__post__related__url'
const URL_RELATION_TABLES = new Set(getEntityRelationUrlTables())

export type RelationCursor = { objectId: string; subjectId: string }

export type DeletedUrlRelation = RelationCursor & { createdById: string | null }

export async function deleteUrlRelationPage(
  query: TransactionQuery,
  table: string,
  urlIds: string[],
  after: RelationCursor | undefined,
  blockedById: string | null,
  limit: number,
): Promise<{ deleted: DeletedUrlRelation[]; page: RelationCursor[] }> {
  return table === POST_RELATED_URL_TABLE
    ? deletePostRelatedUrlPage(query, urlIds, after, blockedById, limit)
    : deleteOrdinaryUrlRelationPage(query, table, urlIds, after, blockedById, limit)
}

async function deleteOrdinaryUrlRelationPage(
  query: TransactionQuery,
  table: string,
  urlIds: string[],
  after: RelationCursor | undefined,
  blockedById: string | null,
  limit: number,
): Promise<{ deleted: DeletedUrlRelation[]; page: RelationCursor[] }> {
  const tableIdentifier = assertWhitelistedSqlIdentifier(
    table,
    URL_RELATION_TABLES,
    'entityRelationTable',
  )
  const statement = sql`/* deleteUrlRelationPage:ordinary */
    WITH candidates AS MATERIALIZED (
      SELECT relation.object_id, relation.subject_id
      FROM `
  statement.append(tableIdentifier)
  statement.append(sql` relation
      WHERE relation.object_id = ANY(${urlIds}::uuid[]) AND relation.deleted_at IS NULL`)
  if (after) {
    statement.append(sql`
      AND (relation.object_id, relation.subject_id) > (${after.objectId}, ${after.subjectId})`)
  }
  statement.append(sql`
      ORDER BY relation.object_id, relation.subject_id
      LIMIT ${limit} FOR UPDATE OF relation
    )
    UPDATE `)
  statement.append(tableIdentifier)
  statement.append(sql` relation
    SET deleted_at = CURRENT_TIMESTAMP, deleted_by_id = ${blockedById}
    FROM candidates
    WHERE relation.object_id = candidates.object_id
      AND relation.subject_id = candidates.subject_id
      AND relation.deleted_at IS NULL
    RETURNING relation.object_id, relation.subject_id, relation.created_by_id`)
  const { rows } = await query<{
    object_id: string
    subject_id: string
    created_by_id: string | null
  }>(statement)
  const deleted = rows.map(toDeletedUrlRelation)
  return { deleted, page: deleted }
}

async function deletePostRelatedUrlPage(
  query: TransactionQuery,
  urlIds: string[],
  after: RelationCursor | undefined,
  blockedById: string | null,
  limit: number,
): Promise<{ deleted: DeletedUrlRelation[]; page: RelationCursor[] }> {
  const afterPredicate = after
    ? 'AND (relation.object_id, relation.subject_id) > ($2::uuid, $3::uuid)'
    : ''
  const values = after ? [urlIds, after.objectId, after.subjectId, limit] : [urlIds, limit]
  const limitParameter = after ? '$4' : '$2'
  const { rows: candidates } = await query<{ object_id: string; subject_id: string }>(
    `/* deleteUrlRelationPage:findPosts */
      SELECT relation.object_id, relation.subject_id
      -- no-mistakes-disable-next-line postgres-required-predicates: discovery finds the posts linking a blocked hostname, so subject_id is the result and has no bound; each partition is probed by object_id
      FROM "${POST_RELATED_URL_TABLE}" relation
      WHERE relation.object_id = ANY($1::uuid[]) AND relation.deleted_at IS NULL
        ${afterPredicate}
      ORDER BY relation.object_id, relation.subject_id
      LIMIT ${limitParameter}`,
    values,
  )
  if (candidates.length === 0) return { deleted: [], page: [] }

  await lockPostPublicationPostScopes(query, [...new Set(candidates.map(row => row.subject_id))])
  const { rows } = await query<{
    object_id: string
    subject_id: string
    created_by_id: string | null
    publication_eligibility_changed: boolean
  }>(
    `/* deleteUrlRelationPage:deletePosts */
      UPDATE "${POST_RELATED_URL_TABLE}" relation
      SET deleted_at = CURRENT_TIMESTAMP, deleted_by_id = $1
      FROM unnest($2::uuid[], $3::uuid[]) candidate(object_id, subject_id)
      WHERE relation.object_id = candidate.object_id
        AND relation.subject_id = candidate.subject_id
        AND relation.deleted_at IS NULL
      RETURNING relation.object_id, relation.subject_id, relation.created_by_id,
        relation.votes_score_net > 0 AS publication_eligibility_changed`,
    [blockedById, candidates.map(row => row.object_id), candidates.map(row => row.subject_id)],
  )
  await recordPostRelatedUrlPublicationChanges(
    query,
    rows.flatMap(row => (row.publication_eligibility_changed ? [row.subject_id] : [])),
  )
  return {
    deleted: rows.map(toDeletedUrlRelation),
    page: candidates.map(row => ({ objectId: row.object_id, subjectId: row.subject_id })),
  }
}

function toDeletedUrlRelation(row: {
  object_id: string
  subject_id: string
  created_by_id: string | null
}): DeletedUrlRelation {
  return {
    objectId: row.object_id,
    subjectId: row.subject_id,
    createdById: row.created_by_id,
  }
}
