import type { TransactionQuery } from '@data-stores/psql'
import {
  topicMergeRelationWorkTables,
  type TopicMergeRelationWorkItem,
} from './merge-relation-page-types.mts'

type ChildPage = { cursor: string | null; hasMore: boolean }
function childPage(rows: { id: string }[], cursor: string | null, limit: number): ChildPage {
  return { cursor: rows.at(-1)?.id ?? cursor, hasMore: rows.length === limit }
}

/** Freeze each author's winning original parent before any history is reparented. */
export async function captureRelationVoteOwners(
  query: TransactionQuery,
  table: string,
  operationId: string,
  parent: TopicMergeRelationWorkItem,
  cursor: string | null,
  limit: number,
): Promise<ChildPage> {
  if (!parent.next_relation_id) return { cursor, hasMore: false }
  const { owners } = topicMergeRelationWorkTables(table)
  const { rows } = await query<{ id: string }>(
    `/* captureRelationVoteOwners */
    WITH page AS MATERIALIZED (
      SELECT id, user_id, score FROM ${table}__votes
      WHERE entity_relation_id = $2::uuid AND subject_id = $3::uuid
        AND id > COALESCE($4::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
      ORDER BY id LIMIT $5::integer
    ), latest AS (SELECT DISTINCT ON (user_id) user_id, id, score FROM page ORDER BY user_id, id DESC),
    captured AS (INSERT INTO ${owners} (operation_id, user_id, priority, cursor_vote_id, score)
      SELECT $1::uuid, user_id, $6::smallint, id, score FROM latest WHERE TRUE
      ON CONFLICT (operation_id, user_id) DO UPDATE SET priority = EXCLUDED.priority,
        cursor_vote_id = EXCLUDED.cursor_vote_id, score = EXCLUDED.score
      WHERE EXCLUDED.priority < ${owners}.priority
        OR (EXCLUDED.priority = ${owners}.priority AND EXCLUDED.cursor_vote_id > ${owners}.cursor_vote_id)
      RETURNING user_id)
    SELECT id FROM page ORDER BY id`,
    [operationId, parent.old_relation_id, parent.old_subject_id, cursor, limit, parent.priority],
  )
  return childPage(rows, cursor, limit)
}

/** Keep every event from the winning original parent, including retractions and old history. */
export async function settleRelationVotes(
  query: TransactionQuery,
  table: string,
  operationId: string,
  parent: TopicMergeRelationWorkItem,
  cursor: string | null,
  limit: number,
  finalTransfer: boolean,
): Promise<ChildPage> {
  const { owners } = topicMergeRelationWorkTables(table)
  const { rows } = await query<{ id: string }>(
    `/* settleRelationVotes */
    WITH page AS MATERIALIZED (
      SELECT id, user_id FROM ${table}__votes
      WHERE entity_relation_id = $2::uuid AND subject_id = $3::uuid
        AND id > COALESCE($4::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
      ORDER BY id LIMIT $5::integer
    ), classified AS MATERIALIZED (
      SELECT page.id, ($7::uuid IS NOT NULL AND ($8::boolean OR owner.priority = $6::smallint)) AS keep
      FROM page LEFT JOIN ${owners} owner ON owner.operation_id = $1::uuid AND owner.user_id = page.user_id
    ), removed AS (DELETE FROM ${table}__votes votes USING classified
      WHERE votes.entity_relation_id = $2::uuid AND votes.subject_id = $3::uuid
        AND votes.id = classified.id AND NOT COALESCE(classified.keep, false) RETURNING votes.id),
    moved AS (UPDATE ${table}__votes votes SET subject_id = $9::uuid, entity_relation_id = $7::uuid
      FROM classified WHERE votes.entity_relation_id = $2::uuid AND votes.subject_id = $3::uuid
        AND votes.id = classified.id AND classified.keep
        AND (votes.entity_relation_id <> $7::uuid OR votes.subject_id <> $9::uuid) RETURNING votes.id)
    SELECT id FROM page ORDER BY id`,
    [
      operationId,
      parent.old_relation_id,
      parent.old_subject_id,
      cursor,
      limit,
      parent.priority,
      parent.next_relation_id,
      finalTransfer,
      parent.next_subject_id,
    ],
  )
  return childPage(rows, cursor, limit)
}

/** A separate indexed flag page preserves resolved audit history without a child cascade. */
export async function settleRelationFlags(
  query: TransactionQuery,
  table: string,
  parent: TopicMergeRelationWorkItem,
  cursor: string | null,
  limit: number,
): Promise<ChildPage> {
  const { rows } = await query<{ id: string }>(
    `/* settleRelationFlags */
    WITH page AS MATERIALIZED (
      SELECT id FROM vote_integrity_flags WHERE ${table}_id = $1::uuid
        AND ${table}_subject_id = $2::uuid
        AND id > COALESCE($3::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
      ORDER BY id LIMIT $4::integer
    ), removed AS (DELETE FROM vote_integrity_flags flags USING page
      WHERE flags.id = page.id AND flags.${table}_id = $1::uuid
        AND $5::uuid IS NULL RETURNING flags.id),
    moved AS (UPDATE vote_integrity_flags flags SET ${table}_id = $5::uuid, ${table}_subject_id = $6::uuid
      FROM page WHERE flags.id = page.id AND flags.${table}_id = $1::uuid
        AND $5::uuid IS NOT NULL AND (flags.${table}_id <> $5::uuid OR flags.${table}_subject_id <> $6::uuid)
      RETURNING flags.id)
    SELECT id FROM page ORDER BY id`,
    [
      parent.old_relation_id,
      parent.old_subject_id,
      cursor,
      limit,
      parent.next_relation_id,
      parent.next_subject_id,
    ],
  )
  return childPage(rows, cursor, limit)
}

/** Consume the owner scratch in bounded author pages and rebuild the exact current election. */
export async function applyRelationMetrics(
  query: TransactionQuery,
  table: string,
  operationId: string,
  parent: TopicMergeRelationWorkItem,
  cursor: string | null,
  limit: number,
): Promise<ChildPage> {
  const { owners } = topicMergeRelationWorkTables(table)
  const { rows } = await query<{ id: string }>(
    `/* applyRelationMetrics */
    WITH page AS MATERIALIZED (
      SELECT user_id, score FROM ${owners} WHERE operation_id = $1::uuid
        AND user_id > COALESCE($2::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
      ORDER BY user_id LIMIT $3::integer
    ), totals AS (
      SELECT COALESCE(sum(users.vote_weight) FILTER (WHERE page.score > 0), 0) AS score_up,
        0::double precision AS score_none,
        COALESCE(sum(users.vote_weight) FILTER (WHERE page.score < 0), 0) AS score_down,
        count(*) FILTER (WHERE page.score > 0)::integer AS count_up,
        0::integer AS count_none,
        count(*) FILTER (WHERE page.score < 0)::integer AS count_down
      FROM page JOIN users ON users.id = page.user_id AND users.deleted_at IS NULL
    ), applied AS (UPDATE ${table} relation SET votes_score_up = relation.votes_score_up + totals.score_up,
      votes_score_none = relation.votes_score_none + totals.score_none,
      votes_score_down = relation.votes_score_down + totals.score_down,
      votes_count_up = relation.votes_count_up + totals.count_up,
      votes_count_none = relation.votes_count_none + totals.count_none,
      votes_count_down = relation.votes_count_down + totals.count_down
      FROM totals WHERE relation.subject_id = $4::uuid AND relation.id = $5::uuid RETURNING relation.id),
    removed AS (DELETE FROM ${owners} owner USING page
      WHERE owner.operation_id = $1::uuid AND owner.user_id = page.user_id RETURNING owner.user_id)
    SELECT user_id AS id FROM page ORDER BY user_id`,
    [operationId, cursor, limit, parent.next_subject_id, parent.next_relation_id],
  )
  return childPage(rows, cursor, limit)
}
