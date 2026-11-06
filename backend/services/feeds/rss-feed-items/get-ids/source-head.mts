import sql, { type SQLStatement } from 'sql-template-strings'

export type SourceKind = 'feed' | 'topic'

/** One indexed item-key probe supplies cursor-relative source activity. */
export function buildSourceHead(
  kind: SourceKind,
  sourceId: SQLStatement,
  cursorSortAt?: string,
  cursorId?: string,
  cursorInclusive = false,
  cutoffDate: Date | null = null,
  itemCutoffId: string | null = null,
): SQLStatement {
  const query =
    kind === 'feed'
      ? sql`SELECT item_sort_at AS sort_at, rss_feed_item_id AS item_id
          FROM rss_feed_item_sources
          WHERE rss_feed_id = `
          .append(sourceId)
          .append(sql` AND item_sort_at IS NOT NULL`)
      : sql`SELECT sort_at, rss_feed_item_id AS item_id
          FROM rss_feed_item_topic_candidates
          WHERE topic_id = `
          .append(sourceId)
          .append(sql` AND sort_at IS NOT NULL`)
  if (cursorSortAt && cursorId) {
    query.append(
      kind === 'feed'
        ? cursorInclusive
          ? sql` AND (item_sort_at, rss_feed_item_id) <= (${cursorSortAt}::timestamptz, ${cursorId}::uuid)`
          : sql` AND (item_sort_at, rss_feed_item_id) < (${cursorSortAt}::timestamptz, ${cursorId}::uuid)`
        : cursorInclusive
          ? sql` AND (sort_at, rss_feed_item_id) <= (${cursorSortAt}::timestamptz, ${cursorId}::uuid)`
          : sql` AND (sort_at, rss_feed_item_id) < (${cursorSortAt}::timestamptz, ${cursorId}::uuid)`,
    )
  }
  if (cutoffDate)
    query.append(
      kind === 'feed'
        ? sql` AND item_sort_at >= ${cutoffDate}`
        : sql` AND sort_at >= ${cutoffDate}`,
    )
  if (itemCutoffId) query.append(sql` AND rss_feed_item_id >= ${itemCutoffId}::uuid`)
  return query.append(
    kind === 'feed'
      ? sql` ORDER BY item_sort_at DESC, rss_feed_item_id DESC LIMIT 1`
      : sql` ORDER BY sort_at DESC, rss_feed_item_id DESC LIMIT 1`,
  )
}
