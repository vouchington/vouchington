import sql, { type SQLStatement } from 'sql-template-strings'

/** Materialize the bounded share window before direct eligibility so either stream can set the page floor. */
export function appendSharedItemPoolCTEs(
  query: SQLStatement,
  {
    cutoffDate,
    currentUserId,
    includeSharedItems,
    pageSize,
    cursorSortAt,
    cursorId,
    cursorInclusive,
  }: {
    cutoffDate: Date | null
    currentUserId?: string
    includeSharedItems: boolean
    pageSize: number
    cursorSortAt?: string
    cursorId?: string
    cursorInclusive?: boolean
  },
): void {
  query.append(sql`, shared_item_pool AS MATERIALIZED (
      SELECT id, rss_feed_item_id, sort_at, shared_by_id, created_at
      FROM rss_feed_item_feed_shares
      WHERE recipient_user_id = ${currentUserId ?? '00000000-0000-0000-0000-000000000000'}
        AND ${includeSharedItems}
  `)
  if (cutoffDate) query.append(sql` AND sort_at >= ${cutoffDate}`)
  if (cursorSortAt && cursorId)
    query.append(
      cursorInclusive
        ? sql` AND (sort_at, id) <= (${cursorSortAt}::timestamptz, ${cursorId}::uuid)`
        : sql` AND (sort_at, id) < (${cursorSortAt}::timestamptz, ${cursorId}::uuid)`,
    )
  query.append(sql`
      ORDER BY sort_at DESC, id DESC
      LIMIT ${pageSize + 1}
    ), saturated_shared_child_boundary AS MATERIALIZED (
      SELECT sort_at, id AS item_id FROM shared_item_pool
      WHERE (SELECT COUNT(*) FROM shared_item_pool) >= ${pageSize + 1}
      ORDER BY sort_at ASC, id ASC
      LIMIT 1
    )`)
}
