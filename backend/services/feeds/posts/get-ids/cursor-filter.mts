import sql, { type SQLStatement } from 'sql-template-strings'
import type { PostFeedCursor } from './feed-cursor.mts'

export function appendTimestampCursorFilter(
  query: SQLStatement,
  {
    cursor,
    idColumn,
    sortAtColumn,
  }: {
    cursor: PostFeedCursor
    idColumn: SQLStatement
    sortAtColumn: SQLStatement
  },
): void {
  if (cursor.created_at_lt === undefined || !cursor.id_lt) return
  const timestampSeconds = cursor.created_at_lt / 1000.0
  query
    .append(sql`\n      AND (`)
    .append(sortAtColumn)
    .append(sql` < to_timestamp(${timestampSeconds}) OR (`)
    .append(sortAtColumn)
    .append(sql` = to_timestamp(${timestampSeconds}) AND `)
    .append(idColumn)
    .append(sql` < ${cursor.id_lt}))`)
}
