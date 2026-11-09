import sql, { type SQLStatement } from 'sql-template-strings'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import { appendEligiblePostsSelect } from './eligible-posts-cte.mts'
import type { PostFeedPageQueryOptions } from './page-options.mts'
import { buildDirectMatchCondition } from './direct-match.mts'
import { appendPostFeedRelationCTEs } from './relation-ctes.mts'
import { appendRawPostFeedCandidates } from './raw-deliveries.mts'
import { buildBroadcastVisibilityFilter } from './visibility-filter.mts'

const CURSOR_TIME_FORMAT = `'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`

/** Inspect a finite delivery prefix before applying viewer and feed eligibility. */
export function buildPostFeedPageQuery(options: PostFeedPageQueryOptions): SQLStatement {
  const { candidateLimit, currentUserId, eligibilityOptions, safeLimit } = options
  const isNew = eligibilityOptions.sort === 'new'
  const query = sql`/* getPostFeedIds */ WITH `
  appendPostFeedRelationCTEs(query, options)
  appendRawPostFeedCandidates(query, options)
  query.append(sql`
    SELECT visible.*, boundary.inspected_id, boundary.inspected_sort_at,
      boundary.inspected_rank, boundary.inspected_post_id,
      ((SELECT count(*) FROM raw_feed_candidates) > ${candidateLimit}`)
  query.append(sql`) AS raw_has_more
    FROM (SELECT 1) anchor
    LEFT JOIN LATERAL (
      SELECT raw.result_id, raw.post_id AS entity_id, eligible_posts.post_type,
        raw.delivery_type, raw.shared_by_id, raw.shared_at`)
  if (isNew)
    query
      .append(sql`, to_char(raw.sort_at AT TIME ZONE 'UTC', `)
      .append(CURSOR_TIME_FORMAT)
      .append(sql`) AS cursor_sort_at`)
  else query.append(sql`, raw.delivery_rank`)
  query.append(sql`
      FROM bounded_feed_candidates raw
      CROSS JOIN LATERAL (`)
  appendEligiblePostsSelect(query, eligibilityOptions, sql`raw.post_id`)
  query
    .append(sql` LIMIT 1) eligible_posts
      WHERE (raw.delivery_type <> 'direct' OR `)
    .append(buildDirectMatchCondition(options))
    .append(sql`)
        AND (raw.delivery_type <> 'share' OR (
          raw.shared_by_id IS NOT NULL
          AND (NOT EXISTS (
            SELECT 1 FROM excluded_users WHERE excluded_users.user_id = raw.shared_by_id
          )) IS TRUE
        ))
        AND `)
    .append(buildBroadcastVisibilityFilter('eligible_posts', currentUserId))
  if (!isNew && options.cutoff)
    query.append(sql` AND (raw.delivery_type <> 'direct' OR
      raw.post_id >= ${getMinUUIDv7ForDate(options.cutoff)})`)
  if (!isNew && options.cutoff)
    query.append(sql` AND (raw.delivery_type <> 'share' OR
      raw.share_sort_at >= ${options.cutoff})`)
  query
    .append(sql` ORDER BY `)
    .append(
      isNew
        ? sql`raw.sort_at DESC, raw.result_id DESC`
        : sql`raw.delivery_rank DESC, raw.post_id DESC, raw.result_id DESC`,
    ).append(sql` LIMIT ${safeLimit + 1}
    ) visible ON TRUE
    LEFT JOIN feed_candidate_boundary boundary ON TRUE`)
  return query
}
