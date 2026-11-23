import sql, { type SQLStatement } from 'sql-template-strings'
import type { FeedPageQueryOptions } from './page-query-options.mts'

const CURSOR_TEXT = `to_char(stop.sort_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`

/**
 * Candidates one arm inspects before any eligibility predicate. The hard maximum is bound beside
 * the configured value so the SQL never trusts the caller to have clamped it.
 */
function capSql(options: FeedPageQueryOptions): SQLStatement {
  return sql`LEAST(${options.inspectionCap}::int, ${options.inspectionCapMax}::int)`
}

/**
 * The partial published_at/id index only covers live rows, so the walk carries its predicate and
 * deleted rows do not count toward the cap.
 */
function appendDirectRange(query: SQLStatement, options: FeedPageQueryOptions): void {
  query.append(sql` FROM rss_feed_items feed_item
    WHERE ${options.includeDirectItems}
      AND feed_item.deleted_at IS NULL
      AND feed_item.published_at >= ${options.cutoffDate}
      AND feed_item.id >= ${options.itemCutoffId}::uuid`)
  if (options.cursorSortAt && options.cursorId)
    query.append(sql` AND (feed_item.published_at, feed_item.id)
      < (${options.cursorSortAt}::timestamptz, ${options.cursorId}::uuid)`)
}

function appendShareRange(query: SQLStatement, options: FeedPageQueryOptions): void {
  query.append(sql` FROM rss_feed_item_feed_shares share
    WHERE ${options.includeSharedItems}
      AND share.recipient_user_id = ${options.currentUserId ?? '00000000-0000-0000-0000-000000000000'}
      AND share.sort_at >= ${options.cutoffDate}`)
  if (options.cursorSortAt && options.cursorId)
    query.append(sql` AND (share.sort_at, share.id)
      < (${options.cursorSortAt}::timestamptz, ${options.cursorId}::uuid)`)
}

/** The direct arm's ordered index walk, capped before the correlated eligibility predicates. */
export function appendDirectCandidates(query: SQLStatement, options: FeedPageQueryOptions): void {
  query.append(sql`(SELECT feed_item.id, feed_item.url_id, feed_item.published_at,
      feed_item.story_id, feed_item.deleted_at, feed_item.has_hacker_news_references,
      feed_item.votes_score_net, feed_item.media_type`)
  if (options.filters.text_search_query?.trim()) query.append(sql`, feed_item.search_vector`)
  appendDirectRange(query, options)
  query.append(sql` ORDER BY feed_item.published_at DESC, feed_item.id DESC LIMIT `)
  query.append(capSql(options)).append(sql`) feed_item`)
}

/** The share arm's recipient-indexed walk, capped before the join and eligibility predicates. */
export function appendShareCandidates(query: SQLStatement, options: FeedPageQueryOptions): void {
  query.append(sql`(SELECT share.id, share.sort_at, share.shared_by_id, share.created_at,
      share.rss_feed_item_id`)
  appendShareRange(query, options)
  query.append(sql` ORDER BY share.sort_at DESC, share.id DESC LIMIT `)
  query.append(capSql(options)).append(sql`) share`)
}

/**
 * Reads the last inspected key of an arm that hit its cap, in the page statement's snapshot, so
 * it is exactly the key the arm stopped at. The stop is the same capped ordered walk the candidates
 * use, aggregated to its row count and last key (no window function, no OFFSET), and it exists only
 * when the walk returned exactly the cap. The one-time filter on the arm's row count sits on the
 * walk's scan, so a full page never executes it. No row means the arm reached the cutoff before
 * the cap.
 */
export function appendInspectionStops(query: SQLStatement, options: FeedPageQueryOptions): void {
  const limit = options.safeLimit
  query.append(sql` UNION ALL (SELECT 'direct_stop'::text, stop.id, NULL::uuid, NULL::timestamptz,
      NULL::uuid, 'direct'::text, NULL::uuid, NULL::timestamptz, `)
  query.append(CURSOR_TEXT).append(sql` FROM (SELECT count(*) AS n,
      (array_agg(walk.id ORDER BY walk.sort_at ASC, walk.id ASC))[1] AS id,
      min(walk.sort_at) AS sort_at
    FROM (SELECT feed_item.id, feed_item.published_at AS sort_at`)
  appendDirectRange(query, options)
  query.append(sql` ORDER BY feed_item.published_at DESC, feed_item.id DESC LIMIT `)
  query.append(capSql(options))
  query.append(sql`) walk WHERE (SELECT direct_rows FROM arm_rows) <= ${limit}) stop
    WHERE stop.n = `)
  query.append(capSql(options)).append(sql`)`)
  query.append(sql` UNION ALL (SELECT 'share_stop'::text, stop.id, NULL::uuid, NULL::timestamptz,
      NULL::uuid, 'share'::text, NULL::uuid, NULL::timestamptz, `)
  query.append(CURSOR_TEXT).append(sql` FROM (SELECT count(*) AS n,
      (array_agg(walk.id ORDER BY walk.sort_at ASC, walk.id ASC))[1] AS id,
      min(walk.sort_at) AS sort_at
    FROM (SELECT share.id, share.sort_at`)
  appendShareRange(query, options)
  query.append(sql` ORDER BY share.sort_at DESC, share.id DESC LIMIT `)
  query.append(capSql(options))
  query.append(sql`) walk WHERE (SELECT share_rows FROM arm_rows) <= ${limit}) stop
    WHERE stop.n = `)
  query.append(capSql(options)).append(sql`)`)
}
