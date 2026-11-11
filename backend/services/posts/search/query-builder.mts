import { assertNever } from '@modules/utils/assert-never'
import type { BasicUser } from '@services/users/types'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { PostSearchOptions, PostSearchSort } from './types.mts'
import {
  detectSearchSort,
  hasSemanticSearch as hasSemanticSearchFn,
  hasTextSearch as hasTextSearchFn,
} from '@modules/search-utils'
import { buildPostRankingScoreExpression } from './query-builder-utils.mts'
import { appendCtes, buildPostSearchCtes } from './query-builder/ctes.mts'
import { appendPostSearchOrderAndLimit } from './query-builder/order-and-limit.mts'
import { appendPostSearchSelectAndJoins } from './query-builder/select-and-joins.mts'
import { appendPostSearchWhereClause } from './query-builder/where-clause.mts'
import { buildSemanticPostCandidates } from './query-builder/semantic-candidates.mts'
import { TOPIC_WALK_ROW_CAP, usesCappedTopicWalk } from './query-builder/topic-walk.mts'

export function buildPostSearchQuery(
  currentUser?: BasicUser,
  requestedOptions: PostSearchOptions = {},
): SQLStatement {
  const decisionInstant = requestedOptions.time_range_as_of ?? new Date()
  const { omitLimit = false, omitOrderBy = false, semanticSearchEmbedding } = requestedOptions
  const hasTextSearch = hasTextSearchFn(requestedOptions)
  const hasSemanticSearch =
    hasSemanticSearchFn(requestedOptions) && semanticSearchEmbedding !== undefined
  const rawSort = detectSearchSort(requestedOptions)
  const sort = rawSort === 'following_new' && !currentUser ? 'new' : rawSort
  const capped = usesCappedTopicWalk(requestedOptions, sort)
  const options = requestedOptions
  const limit = capped ? TOPIC_WALK_ROW_CAP : options.limit
  const rankingScoreExpression = buildPostRankingScoreExpression({
    hasTextSearch,
    hasSemanticSearch,
  })
  const followingRankExpression =
    options.following_phase === 'followed'
      ? sql`1`
      : options.following_phase === 'other'
        ? sql`0`
        : sort === 'following_new' && currentUser
          ? sql`CASE WHEN viewer_following.object_id IS NULL THEN 0 ELSE 1 END`
          : null
  const query = sql``.append(
    `/* ${capped && options.inspectedTail ? 'buildTopicWalkTailQuery' : 'buildPostSearchQuery'} */\n  `,
  )

  const ctes = buildPostSearchCtes({
    ...options,
    hasSemanticSearch,
    hasTextSearch,
  })
  if (hasSemanticSearch)
    ctes.push(buildSemanticPostCandidates(currentUser, options, hasTextSearch, decisionInstant))
  appendCtes(query, ctes)
  // Community lists keep the checked candidate_posts name: one sort-key walk, then the page.
  const candidateWalk = options.community_id !== undefined || capped
  if (candidateWalk) {
    query.append(
      ctes.length > 0
        ? sql`,\n candidate_posts AS NOT MATERIALIZED (`
        : sql`WITH candidate_posts AS NOT MATERIALIZED (`,
    )
  }
  appendPostSearchSelectAndJoins(query, {
    decisionInstant,
    useSemanticCandidates: hasSemanticSearch,
    currentUser,
    followingRankExpression,
    hasSemanticSearch,
    hasTextSearch,
    options,
    rankingScoreExpression,
    sort,
  })
  const whereArgs = {
    decisionInstant,
    currentUser,
    followingRankExpression,
    hasSemanticSearch,
    hasTextSearch,
    options,
    rankingScoreExpression,
    sort,
  }
  // A capped walk reads only the sort key and cursor; eligibility and membership run per row outside.
  appendPostSearchWhereClause(query, { ...whereArgs, paginationOnly: capped })
  appendPostSearchOrderAndLimit(query, {
    followingRankExpression,
    hasSemanticSearch,
    hasTextSearch,
    limit,
    omitLimit,
    omitOrderBy,
    // A phase walk has a constant rank, so its order is the id key alone.
    sort: options.following_phase === undefined ? sort : 'new',
  })
  if (candidateWalk) {
    appendCommunityCandidatePage(query, {
      outerPage: capped
        ? {
            tail: options.inspectedTail === true,
            limit: options.limit ?? 100,
            appendWhere: () =>
              appendPostSearchWhereClause(query, {
                ...whereArgs,
                paginationOnly: false,
                options: { ...options, topicMembershipColumn: 'candidate_posts.id' },
              }),
          }
        : null,
      followingRankExpression,
      hasSemanticSearch,
      hasTextSearch,
      hydrate: options.hydrateDataPointPage === true,
      ranking: rankingScoreExpression !== null,
      sort,
    })
  }

  return query
}

function appendCommunityCandidatePage(
  query: SQLStatement,
  {
    outerPage,
    followingRankExpression,
    hasSemanticSearch,
    hasTextSearch,
    hydrate,
    ranking,
    sort,
  }: {
    outerPage: { tail: boolean; limit: number; appendWhere: () => void } | null
    followingRankExpression: SQLStatement | null
    hasSemanticSearch: boolean
    hasTextSearch: boolean
    hydrate: boolean
    ranking: boolean
    sort: PostSearchSort
  },
): void {
  query.append(sql`)
    SELECT
      candidate_posts.id,
      candidate_posts.post_type`)
  if (hydrate) {
    query.append(sql`,
      candidate_posts.title,
      candidate_posts.data_point_vertical,
      candidate_posts.structured_data`)
  }
  if (ranking) query.append(sql`,\n      candidate_posts.ranking_score`)
  if (followingRankExpression) query.append(sql`,\n      candidate_posts.following_rank`)
  query.append(communitySortColumns(sort))
  query.append(sql`
    FROM candidate_posts`)
  if (outerPage && !outerPage.tail) {
    query.append(sql`\n    JOIN posts ON posts.id = candidate_posts.id`)
    outerPage.appendWhere()
  }
  appendPostSearchOrderAndLimit(query, {
    followingRankExpression,
    hasSemanticSearch,
    hasTextSearch,
    omitLimit: true,
    omitOrderBy: false,
    sort,
    idRelation: 'candidate_posts',
    outputColumns: true,
  })
  if (outerPage?.tail) query.append(sql`\n    OFFSET ${TOPIC_WALK_ROW_CAP - 1} LIMIT 1`)
  else if (outerPage) query.append(sql`\n    LIMIT ${outerPage.limit}`)
}

function communitySortColumns(sort: PostSearchSort): SQLStatement {
  switch (sort) {
    case 'best':
      return sql`,\n      candidate_posts.vote_score`
    case 'hot':
      return sql`,\n      candidate_posts.hot_score`
    case 'trending':
      return sql`,\n      candidate_posts.hot_score,\n      candidate_posts.trending_score`
    case 'new':
    case 'following_new':
    case 'relevance':
      return sql``
    default:
      return assertNever(sort, 'Unknown post search sort')
  }
}
