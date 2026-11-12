import sql, { type SQLStatement } from 'sql-template-strings'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import { appendEligiblePostsCTE, appendEligiblePostsSelect } from './eligible-posts-cte.mts'
import type { PostFeedPageQueryOptions } from './page-options.mts'
import { buildDirectMatchCondition } from './direct-match.mts'
import { appendBestWalk } from './best-walk.mts'
import { appendPostFeedRelationCTEs } from './relation-ctes.mts'
import { buildBroadcastVisibilityFilter } from './visibility-filter.mts'

const CURSOR_TIME_FORMAT = `'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`

/** One statement per sort: filtered walks over the viewer's deliveries, `LIMIT page + 1`. */
export function buildPostFeedPageQueryBody(options: PostFeedPageQueryOptions): SQLStatement {
  const query = sql`WITH `
  appendPostFeedRelationCTEs(query, {
    communityId: options.communityId,
    currentUserId: options.currentUserId,
  })
  appendEligiblePostsCTE(query, options.eligibilityOptions)
  if (options.eligibilityOptions.sort === 'best') appendBestWalk(query, options)
  else appendDeliveryWalk(query, options)
  return query
}

const sortSelect = (sort: 'new' | 'hot', alias: string) =>
  sort === 'hot' ? `,\n        ${alias}.hot_score` : ''

/**
 * Direct posts and recipient shares each walk their own sort index, newest or hottest first.
 * The page is the first `limit + 1` rows of the merged order, so each walk needs at most that many.
 */
function appendDeliveryWalk(query: SQLStatement, options: PostFeedPageQueryOptions): void {
  const sort = options.eligibilityOptions.sort as 'new' | 'hot'
  query.append(sql`
    SELECT deliveries.result_id, deliveries.entity_id, deliveries.post_type, deliveries.sort_at,
      deliveries.delivery_type, deliveries.shared_by_id, deliveries.shared_at`)
  query.append(
    sort === 'hot'
      ? sql`, deliveries.hot_score`
      : sql`,
      to_char(deliveries.sort_at AT TIME ZONE 'UTC', `.append(CURSOR_TIME_FORMAT).append(sql`)
        AS cursor_sort_at`),
  )
  query.append(sql`
    FROM (`)
  appendDirectArm(query, options, sort)
  if (options.includeSharedPosts) {
    query.append(sql`
      UNION ALL`)
    appendShareArm(query, options, sort)
  }
  query.append(
    sql`
    ) deliveries
    ORDER BY `.append(sort === 'hot' ? 'deliveries.hot_score DESC' : 'deliveries.sort_at DESC')
      .append(sql`, deliveries.result_id DESC
    LIMIT ${options.safeLimit + 1}`),
  )
}

function appendDirectArm(
  query: SQLStatement,
  { cursor, cutoff, safeLimit, ...options }: PostFeedPageQueryOptions,
  sort: 'new' | 'hot',
): void {
  query.append(sql`(
      SELECT eligible_posts.id AS result_id, eligible_posts.id AS entity_id,
        eligible_posts.post_type, eligible_posts.created_at AS sort_at`)
  query.append(sortSelect(sort, 'eligible_posts'))
  query
    .append(sql`,
        'direct'::text AS delivery_type, NULL::uuid AS shared_by_id,
        NULL::timestamptz AS shared_at
      FROM eligible_posts
      WHERE `)
    .append(buildDirectMatchCondition(options))
    .append(sql`
        AND `)
    .append(buildBroadcastVisibilityFilter('eligible_posts', options.currentUserId))
  if (cutoff)
    query.append(sql`
        AND eligible_posts.id >= ${getMinUUIDv7ForDate(cutoff)}`)
  if (cursor?.sort === 'new') {
    // The id bound keeps the keyset condition on the id index; created_at derives from id.
    const cursorDate = new Date(cursor.sortAt)
    query.append(sql`
        AND eligible_posts.id < ${getMinUUIDv7ForDate(new Date(cursorDate.getTime() + 1))}::uuid
        AND (eligible_posts.created_at, eligible_posts.id)
          < (${cursor.sortAt}::timestamptz, ${cursor.id}::uuid)`)
  } else if (cursor?.sort === 'hot')
    query.append(sql`
        AND (eligible_posts.hot_score, eligible_posts.id)
          < (${cursor.score}::float8, ${cursor.id}::uuid)`)
  query.append(
    sql`
      ORDER BY `.append(sort === 'hot' ? 'eligible_posts.hot_score DESC, ' : '')
      .append(sql`eligible_posts.id DESC
      LIMIT ${safeLimit + 1}
    )`),
  )
}

function appendShareArm(
  query: SQLStatement,
  { cursor, cutoff, currentUserId, eligibilityOptions, safeLimit }: PostFeedPageQueryOptions,
  sort: 'new' | 'hot',
): void {
  query.append(sql`
    (
      SELECT post_feed_shares.id AS result_id, eligible_target.id AS entity_id,
        eligible_target.post_type, post_feed_shares.sort_at`)
  query.append(sortSelect(sort, 'eligible_target'))
  query.append(sql`,
        'share'::text AS delivery_type, post_feed_shares.shared_by_id,
        post_feed_shares.created_at AS shared_at
      FROM post_feed_shares
      CROSS JOIN LATERAL (`)
  appendEligiblePostsSelect(query, eligibilityOptions, sql`post_feed_shares.post_id`)
  // Keep the exclusion a BooleanTest rather than a pulled-up anti join: on sparse recipient
  // pages the anti join estimates one delivery and rescans eligibility per delivery.
  query
    .append(sql`
        LIMIT 1
      ) eligible_target
      WHERE post_feed_shares.recipient_user_id = ${currentUserId}
        AND post_feed_shares.shared_by_id IS NOT NULL
        AND (NOT EXISTS (
          SELECT 1 FROM excluded_users
          WHERE excluded_users.user_id = post_feed_shares.shared_by_id
        )) IS TRUE
        AND `)
    .append(buildBroadcastVisibilityFilter('eligible_target', currentUserId))
  if (cutoff)
    query.append(sql`
        AND post_feed_shares.sort_at >= ${cutoff}`)
  if (cursor?.sort === 'new')
    query.append(sql`
        AND (post_feed_shares.sort_at, post_feed_shares.id)
          < (${cursor.sortAt}::timestamptz, ${cursor.id}::uuid)`)
  else if (cursor?.sort === 'hot')
    query.append(sql`
        AND (eligible_target.hot_score, post_feed_shares.id)
          < (${cursor.score}::float8, ${cursor.id}::uuid)`)
  query.append(
    sql`
      ORDER BY `.append(
      sort === 'hot' ? 'eligible_target.hot_score DESC' : 'post_feed_shares.sort_at DESC',
    ).append(sql`, post_feed_shares.id DESC
      LIMIT ${safeLimit + 1}
    )`),
  )
}
