import type { BasicUser } from '@services/users/types'
import sql, { type SQLStatement } from 'sql-template-strings'
import { buildHotScoreExpression } from '../query-builder-utils.mts'
import type { PostSearchOptions } from '../types.mts'

export function appendPostSearchSelectAndJoins(
  query: SQLStatement,
  {
    currentUser,
    followingRankExpression,
    hasSemanticSearch,
    hasTextSearch,
    options,
    rankingScoreExpression,
    sort,
    useSemanticCandidates = false,
  }: {
    currentUser?: BasicUser
    followingRankExpression: SQLStatement | null
    hasSemanticSearch: boolean
    hasTextSearch: boolean
    options: PostSearchOptions
    rankingScoreExpression: SQLStatement | null
    sort: string
    useSemanticCandidates?: boolean
  },
): void {
  query.append(sql`SELECT
      posts.id,
      posts.post_type
  `)
  if (rankingScoreExpression) appendSelectExpression(query, rankingScoreExpression, 'ranking_score')
  if (followingRankExpression)
    appendSelectExpression(query, followingRankExpression, 'following_rank')
  if (sort === 'best') query.append(sql`,\n      posts.votes_score_sort AS vote_score\n    `)
  if (sort === 'hot') {
    query.append(sql`,\n    `)
    query.append(buildHotScoreExpression())
    query.append(sql` AS hot_score`)
  }
  if (useSemanticCandidates) {
    // Keep ranking/filter distance work bounded even when a full-table join looks cheaper.
    query.append(sql`
      FROM semantic_post_candidates
      CROSS JOIN LATERAL (
        SELECT semantic_selected_post.* FROM posts semantic_selected_post
        WHERE semantic_selected_post.id = semantic_post_candidates.id
        LIMIT 1
      ) posts
    `)
  } else {
    query.append(sql`\n    FROM posts\n`)
  }
  appendSearchJoins(query, { hasSemanticSearch, hasTextSearch, options })
  if (sort === 'following_new' && currentUser) appendFollowingJoin(query, currentUser.id)
}

function appendSelectExpression(
  query: SQLStatement,
  expression: SQLStatement,
  alias: string,
): void {
  query.append(sql`,\n      `)
  query.append(expression)
  query.append(` AS ${alias}\n    `)
}

function appendSearchJoins(
  query: SQLStatement,
  {
    hasSemanticSearch,
    hasTextSearch,
    options,
  }: {
    hasSemanticSearch: boolean
    hasTextSearch: boolean
    options: PostSearchOptions
  },
): void {
  if (hasTextSearch) query.append(sql`\n    CROSS JOIN text_search_tsquery\n    `)
  if (hasSemanticSearch) query.append(sql`\n    CROSS JOIN semantic_search_embedding\n    `)
  if (options.similar_post_id) query.append(sql`\n    CROSS JOIN similar_post_embedding\n    `)
  if (options.similar_topic_id) query.append(sql`\n    CROSS JOIN similar_topic_embedding\n    `)
  if (options.similar_rss_feed_item_id) {
    query.append(sql`\n    CROSS JOIN similar_rss_feed_item_embedding\n    `)
  }
}

function appendFollowingJoin(query: SQLStatement, userId: string): void {
  query.append(sql`
    LEFT JOIN relation__user__follow__user AS viewer_following
      ON viewer_following.subject_id = ${userId}
     AND viewer_following.object_id = posts.created_by_id
     AND viewer_following.deleted_at IS NULL
    `)
}
