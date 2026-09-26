import sql, { type SQLStatement } from 'sql-template-strings'
import { publicationPageLimit } from './page-limit.mts'
const NIL_UUID = '00000000-0000-0000-0000-000000000000'

/** An exact snapshot interval preserves both index ordering keys even in custom prepared plans. */
export function publicationSnapshotKeyPageSql(
  snapshotId: string | null,
  cursorId: string | null,
  limit: number,
): SQLStatement {
  const statement = sql`WITH bounds AS (SELECT ${snapshotId}::uuid AS target_snapshot_id)
    SELECT id, kind, uuid_value::text AS "uuidValue", text_value AS "textValue", post_type::text AS "postType", day::text AS day
    FROM post_publication_identity_snapshot_keys CROSS JOIN bounds
    WHERE snapshot_id = bounds.target_snapshot_id AND (snapshot_id, id) `
  statement
    .append(cursorId === null ? '>=' : '>')
    .append(sql` (bounds.target_snapshot_id, ${cursorId ?? NIL_UUID}::uuid)
    ORDER BY snapshot_id, id LIMIT `)
    .append(publicationPageLimit(limit))
  return statement
}
