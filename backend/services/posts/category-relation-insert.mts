import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import type { PrivateUser } from '@services/users/types'
import { upsertEntityRelation } from '@services/entity-relations'
import type { EntityRelationMetadata } from '@services/entity-relations/metadata'
import { runRelationPublicationMutation } from '@services/entity-relations/publication-mutation'
import { recordPostTopicRelationPublicationChanges } from '@services/entity-relations/post-topic-publication'
import sql, { type SQLStatement } from 'sql-template-strings'

type InsertedCategoryRelation = {
  id: string
  subject_id: string
  object_id: string
  newly_active?: boolean
  relation_kind: 'alias' | 'topic'
}

const relationWriteOptions = {
  vote: false as const,
  enqueueVoteStats: false,
  suppressNotificationReconcile: true,
}

/**
 * Alias and topic category rows are written once, before the muted-topic check. When both tables
 * change, one statement locks and inserts aliases first, then topics, and both publication
 * captures stay on that statement's rows.
 */
export async function upsertPostCategoryRelationRows({
  aliasIds,
  aliasRelation,
  creator,
  options,
  postId,
  topicIds,
  topicRelation,
}: {
  aliasIds: string[]
  aliasRelation: EntityRelationMetadata
  creator: PrivateUser
  options: QueryOptions
  postId: string
  topicIds: string[]
  topicRelation: EntityRelationMetadata
}): Promise<void> {
  const writeOptions = { ...options, ...relationWriteOptions }
  if (aliasIds.length === 0 && topicIds.length === 0) return
  if (aliasIds.length === 0 || topicIds.length === 0) {
    const relation = aliasIds.length === 0 ? topicRelation : aliasRelation
    const ids = aliasIds.length === 0 ? topicIds : aliasIds
    await upsertEntityRelation(
      creator,
      relation,
      { id: postId },
      ids.map(id => ({ id })),
      writeOptions,
    )
    return
  }

  const statement = sql`/* buildInsertQuery */
    WITH `
  appendRelationUpsert(statement, 'alias', aliasRelation, creator.id, postId, aliasIds)
  statement.append(sql`, `)
  appendRelationUpsert(
    statement,
    'topic',
    topicRelation,
    creator.id,
    postId,
    topicIds,
    'alias_upserted',
  )
  statement.append(sql`
    SELECT alias_upserted.id, alias_upserted.subject_id, alias_upserted.object_id,
      (alias_existing.subject_id IS NULL OR alias_existing.deleted_at IS NOT NULL) AS newly_active,
      'alias'::text AS relation_kind
    FROM alias_upserted
    JOIN alias_input
      ON alias_input.subject_id = alias_upserted.subject_id
      AND alias_input.object_id = alias_upserted.object_id
    LEFT JOIN alias_existing
      ON alias_existing.subject_id = alias_upserted.subject_id
      AND alias_existing.object_id = alias_upserted.object_id
    UNION ALL
    SELECT topic_upserted.id, topic_upserted.subject_id, topic_upserted.object_id,
      (topic_existing.subject_id IS NULL OR topic_existing.deleted_at IS NOT NULL) AS newly_active,
      'topic'::text AS relation_kind
    FROM topic_upserted
    JOIN topic_input
      ON topic_input.subject_id = topic_upserted.subject_id
      AND topic_input.object_id = topic_upserted.object_id
    LEFT JOIN topic_existing
      ON topic_existing.subject_id = topic_upserted.subject_id
      AND topic_existing.object_id = topic_upserted.object_id
  `)

  await runRelationPublicationMutation(
    writeOptions,
    aliasRelation.table_name,
    [postId],
    aliasIds,
    [],
    async (transactionQuery: TransactionQuery) => {
      const { rows } = await transactionQuery(statement)
      const inserted = rows as InsertedCategoryRelation[]
      const topics = inserted.filter(
        row => row.relation_kind === 'topic' && row.newly_active !== false,
      )
      await recordPostTopicRelationPublicationChanges(
        transactionQuery,
        topicRelation.table_name,
        topics,
      )
      return inserted.filter(row => row.relation_kind === 'alias')
    },
  )
}

function appendRelationUpsert(
  query: SQLStatement,
  prefix: 'alias' | 'topic',
  relation: EntityRelationMetadata,
  creatorId: string,
  postId: string,
  objectIds: string[],
  afterCte?: 'alias_upserted',
): void {
  const subjectIds = objectIds.map(() => postId)
  query.append(`${prefix}_input AS (
      SELECT subject_id, object_id, ordinality
      FROM unnest(`)
  query.append(sql`${subjectIds}::uuid[], ${objectIds}::uuid[]) WITH ORDINALITY
        AS t(subject_id, object_id, ordinality)
    ), `)
  query.append(`${prefix}_existing AS MATERIALIZED (
      SELECT locked.subject_id, locked.object_id, locked.deleted_at
      FROM `)
  if (afterCte)
    query.append(`(SELECT count(*) AS ready FROM ${afterCte}) guard
      JOIN `)
  query.append(`(
        SELECT subject_id, object_id FROM ${prefix}_input
        ORDER BY subject_id, object_id
      ) input`)
  if (afterCte) query.append(` ON guard.ready >= 0`)
  query.append(`
      JOIN LATERAL (
        SELECT r.subject_id, r.object_id, r.deleted_at
        FROM `)
  query.append(relation.table_name)
  query.append(` r
        WHERE r.subject_id = input.subject_id
          AND r.object_id = input.object_id
        FOR UPDATE
      ) locked ON true
    ), ${prefix}_upserted AS (
      INSERT INTO `)
  query.append(relation.table_name)
  query.append(sql` (subject_id, object_id, created_by_id)
      SELECT input.subject_id, input.object_id, ${creatorId}
      FROM `)
  query.append(`${prefix}_input input
      LEFT JOIN ${prefix}_existing existing
        ON existing.subject_id = input.subject_id AND existing.object_id = input.object_id
      ORDER BY input.subject_id, input.object_id
      ON CONFLICT (subject_id, object_id)
        DO UPDATE SET
          created_at = CASE
            WHEN `)
  query.append(relation.table_name)
  query.append(`.deleted_at IS NULL THEN `)
  query.append(relation.table_name)
  query.append(`.created_at
            ELSE clock_timestamp()
          END,
          deleted_at = NULL,
          deleted_by_id = NULL
      RETURNING *
    )`)
}
