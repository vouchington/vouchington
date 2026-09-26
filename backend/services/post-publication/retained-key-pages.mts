import { retainedKeyPayloadSql } from './concrete-key-columns.mts'
import sql, { type SQLStatement } from 'sql-template-strings'
import { publicationPageLimit } from './page-limit.mts'
const NIL_UUID = '00000000-0000-0000-0000-000000000000'

/** Covering native seeks bound reads independently of the scope's cardinality estimate. */
export function publicationRetainedKeyPageSql(
  dirtyWorkId: string | null,
  cursorId: string | null,
  limit: number,
): SQLStatement {
  const budget = publicationPageLimit(limit)
  return sql`WITH RECURSIVE bounds AS MATERIALIZED (
      SELECT ${dirtyWorkId}::uuid AS dirty_work_id, ${cursorId ?? NIL_UUID}::uuid AS cursor_id), key_page AS (
    SELECT first_key.*, 1::bigint AS page_number FROM bounds CROSS JOIN LATERAL (`
    .append(snapshotKeySeek(sql`bounds.cursor_id`, cursorId === null))
    .append(sql`) first_key UNION ALL
    SELECT next_key.*, previous.page_number + 1 FROM key_page previous CROSS JOIN bounds
    CROSS JOIN LATERAL (`)
    .append(snapshotKeySeek(sql`previous.id`, false))
    .append(sql`) next_key WHERE previous.page_number < `)
    .append(budget).append(sql`)
    SELECT id, impact_post_identity_id, kind, uuid_value::text AS "uuidValue", text_value AS "textValue", post_type::text AS "postType", day::text AS day
    FROM key_page ORDER BY id`)
}

function snapshotKeySeek(cursor: SQLStatement, inclusive: boolean): SQLStatement {
  return sql`SELECT key.id, key.impact_post_identity_id, `
    .append(retainedKeyPayloadSql())
    .append(sql` FROM post_publication_dirty_work_keys key
    WHERE dirty_work_id = bounds.dirty_work_id AND (dirty_work_id, id) `)
    .append(inclusive ? '>=' : '>')
    .append(sql` (bounds.dirty_work_id, `)
    .append(cursor)
    .append(') AND id ')
    .append(inclusive ? '>=' : '>')
    .append(cursor)
    .append(' ORDER BY dirty_work_id, id LIMIT 1')
}
