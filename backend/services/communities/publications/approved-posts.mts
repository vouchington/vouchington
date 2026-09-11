import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { decodeUuidCursor, isScoreCursor, isSimpleCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import { getEntityRelationTableNameOrThrow } from '@services/entity-relations/metadata'
import {
  buildPublicPostEligibilityFilter,
  buildViewerPostDiscoveryEligibilityFilter,
} from '@modules/feed-query-builders'
import type { BasicUser } from '@services/users/types'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { appendHashtagFilters, appendUniversalTopicFilters } from './search-filters.mts'
import {
  buildCommunityPostHotScoreExpression,
  encodeCommunityPostCursor,
  type CommunityFeedPost,
  type CommunityPostSort,
} from './approved-posts-support.mts'

export async function searchCommunityPosts(
  communityId: string,
  options?: QueryOptions & {
    currentUser?: BasicUser | null
    post_types?: string[]
    text_search_query?: string
    universal_topic_ids?: string[]
    hashtag_topic_ids?: string[]
    hashtag_alias_ids?: string[]
    has_unknown_hashtag?: boolean
    excludePostIds?: string[]
    sort?: CommunityPostSort
    limit?: number
    after?: string
  },
): Promise<{ results: CommunityFeedPost[]; page_info: PageInfo }> {
  const limit = options?.limit ?? 20
  assert(Number.isInteger(limit), 422, 'limit must be an integer')
  assert(limit > 0 && limit <= 100, 422, 'limit must be between 1 and 100')
  const sort = options?.sort ?? 'new'
  let cursorId: string | undefined
  let cursorHotScore: number | undefined
  if (options?.after) {
    if (sort === 'hot') {
      const cursor = decodeUuidCursor(options.after, isScoreCursor, 'Invalid cursor format')
      cursorHotScore = cursor.score
      cursorId = cursor.id
    } else {
      const cursor = decodeUuidCursor(options.after, isSimpleCursor, 'Invalid cursor format')
      cursorId = cursor.id
    }
  }
  const mutedTopicsTable = getEntityRelationTableNameOrThrow({
    subjectType: 'community',
    objectType: 'topic',
    predicate: 'mute',
  })
  const query = sql`/* searchCommunityPosts */
    SELECT posts.*`
  if (sort === 'hot') {
    query.append(sql`,\n      `)
    query.append(buildCommunityPostHotScoreExpression())
    query.append(sql` AS hot_score`)
  }
  query.append(sql`
    FROM community_post_reviews cpr
    JOIN view_posts posts ON posts.id = cpr.post_id
    JOIN posts root_post ON root_post.id = COALESCE(posts.root_id, posts.id)
  `)
  if (sort === 'hot') {
    query.append(sql`
    JOIN posts post_scores ON post_scores.id = posts.id
  `)
  }
  query.append(sql`
    WHERE cpr.community_id = ${communityId}
      AND posts.community_id = ${communityId}
      AND posts.deleted_at IS NULL
      AND posts.post_type != 'topic_recommendation'
      AND cpr.approved_at IS NOT NULL
      AND cpr.unpublished_at IS NULL
      AND cpr.rejected_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM relation__post__category__topic pc
        JOIN `)
  query.append(`${mutedTopicsTable} mt`)
  query.append(sql`
          ON mt.object_id = pc.object_id
          AND mt.subject_id = ${communityId}
          AND mt.deleted_at IS NULL
        WHERE pc.subject_id = posts.id
          AND pc.deleted_at IS NULL AND pc.votes_score_net > 0
      )
      AND NOT EXISTS (
        SELECT 1
        FROM relation__post__category__topic_alias post_alias
        JOIN topic_aliases alias ON alias.id = post_alias.object_id
        JOIN `)
  query.append(`${mutedTopicsTable} mt`)
  query.append(sql`
          ON mt.object_id = alias.topic_id
          AND mt.subject_id = ${communityId}
          AND mt.deleted_at IS NULL
        WHERE post_alias.subject_id = posts.id
          AND post_alias.deleted_at IS NULL
          AND post_alias.votes_score_net > 0
      )
  `)
  if (options?.post_types && options.post_types.length > 0) {
    query.append(sql` AND posts.post_type = ANY(${options.post_types}::text[])`)
  }
  if (options?.text_search_query?.trim()) {
    query.append(
      sql` AND posts.search_vector @@ websearch_to_tsquery('voucha_english', ${options.text_search_query.trim()})`,
    )
  }
  if (options?.universal_topic_ids?.length) {
    appendUniversalTopicFilters(query, options.universal_topic_ids, 'posts')
  }
  appendHashtagFilters(
    query,
    {
      aliasIds: options?.hashtag_alias_ids,
      hasUnknownHashtag: options?.has_unknown_hashtag,
      topicIds: options?.hashtag_topic_ids,
    },
    'posts',
  )
  if (options?.excludePostIds && options.excludePostIds.length > 0) {
    query.append(sql` AND posts.id != ALL(${options.excludePostIds}::uuid[])`)
  }

  const eligibility = options?.currentUser
    ? buildViewerPostDiscoveryEligibilityFilter('posts', 'root_post', {
        currentUserId: options.currentUser.id,
        includeArchivedCommunities: true,
        isAdministrator: options.currentUser.roles.includes('administrator'),
      })
    : buildPublicPostEligibilityFilter('posts', 'root_post', {
        includeArchivedCommunities: true,
      })
  query.append(sql` AND `).append(eligibility)

  if (sort === 'hot' && cursorHotScore !== undefined && cursorId) {
    query.append(sql` AND (`)
    query.append(buildCommunityPostHotScoreExpression())
    query.append(sql`, posts.id) < (${cursorHotScore}, ${cursorId})`)
  } else if (cursorId !== undefined) {
    query.append(sql` AND posts.id < ${cursorId}`)
  }

  if (sort === 'hot') {
    query.append(sql`
      ORDER BY hot_score DESC, posts.id DESC
      LIMIT ${limit + 1}
    `)
  } else {
    query.append(sql`
      ORDER BY posts.id DESC
      LIMIT ${limit + 1}
    `)
  }

  const { rows } = await read(query, options)

  const hasNextPage = rows.length > limit
  const results: CommunityFeedPost[] = []
  for (let i = 0; i < Math.min(rows.length, limit); i++) {
    results.push(rows[i]! as CommunityFeedPost)
  }

  return {
    results,
    page_info: {
      has_next_page: hasNextPage,
      end_cursor:
        hasNextPage && results.length > 0 ? encodeCommunityPostCursor(sort, results.at(-1)!) : null,
      start_cursor: results.length > 0 ? encodeCommunityPostCursor(sort, results[0]!) : null,
    },
  }
}
