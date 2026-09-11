import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { isUUID, isSlug } from '@modules/utils'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import type { TopicMetrics } from './types.mts'
import createError from 'http-errors'
import {
  buildViewerPostDiscoveryEligibilityFilter,
  buildTopicPostCandidateSelect,
} from '@modules/feed-query-builders'

export const getTopicMetricsByAny = async (
  idOrSlug: string,
  options: QueryOptions = {},
): Promise<TopicMetrics | null> => {
  const trimmedInput = idOrSlug.trim()
  const normalizedInput = trimmedInput.toLowerCase()
  const isId = isUUID(trimmedInput)
  const isSlugValue = isSlug(normalizedInput)

  if (!isId && !isSlugValue) {
    throw createError(422, `Invalid topic identifier: ${idOrSlug}`)
  }

  const { rows } = await read(
    `/* getTopicMetricsByAny */
    WITH candidates AS (
      SELECT t.id, 0 AS priority
      FROM topics t
      WHERE t.${isId ? 'id' : 'slug'} = $1
        AND t.deleted_at IS NULL
        AND t.merged_into_topic_id IS NULL

      UNION ALL

      SELECT source_topic.merged_into_topic_id AS id, 1 AS priority
      FROM topics source_topic
      JOIN topics destination_topic ON destination_topic.id = source_topic.merged_into_topic_id
      WHERE source_topic.${isId ? 'id' : 'slug'} = $1
        AND source_topic.deleted_at IS NULL
        AND source_topic.merged_into_topic_id IS NOT NULL
        AND destination_topic.deleted_at IS NULL
        AND destination_topic.merged_into_topic_id IS NULL
    ),
    topic_id AS (
      SELECT id
      FROM candidates
      ORDER BY priority, id DESC
      LIMIT 1
    )
    SELECT vtm.*
    FROM view_topic_metrics vtm
    INNER JOIN topic_id t ON vtm.id = t.id
    LIMIT 1
    `,
    [isId ? trimmedInput : normalizedInput],
    options,
  )

  if (!rows[0]) return null

  const row = rows[0]

  return {
    __entity_type: 'topic_metrics',
    id: row.id,
    count: {
      discussions: Number(row.count__discussions) || 0,
      reviews: Number(row.count__reviews) || 0,
      'data-points': Number(row.count__data_points) || 0,
      news: Number(row.count__news) || 0,
      latest: Number(row.count__latest) || 0,
    },
    ratings: {
      count: {
        '1': Number(row.ratings__count__1) || 0,
        '2': Number(row.ratings__count__2) || 0,
        '3': Number(row.ratings__count__3) || 0,
        '4': Number(row.ratings__count__4) || 0,
        '5': Number(row.ratings__count__5) || 0,
      },
    },
    ratings__updated_at: row.ratings__updated_at,
    bookmarks: {
      follow: Number(row.bookmarks__follow_count) || 0,
    },
    bookmarks__updated_at: row.bookmarks__updated_at,
  }
}

export async function getTopicViewerCounts(
  currentUser: PrivateUser,
  topicId: string,
  options: QueryOptions = {},
): Promise<NonNullable<TopicMetrics['viewer_count']>> {
  const eligibility = buildViewerPostDiscoveryEligibilityFilter('candidate_post', 'root_post', {
    currentUserId: currentUser.id,
    isAdministrator: currentUser.roles.includes('administrator'),
  })
  const query = sql`/* getTopicViewerCounts */
      SELECT
        (
          SELECT COUNT(DISTINCT candidate_post.id)::bigint
          FROM (`.append(buildTopicPostCandidateSelect(topicId)).append(sql`) candidate
          JOIN posts candidate_post ON candidate_post.id = candidate.post_id
          JOIN posts root_post
            ON root_post.id = COALESCE(candidate_post.root_id, candidate_post.id)
          WHERE candidate_post.post_type = 'discussion'
            AND `)
  query.append(eligibility).append(sql`
        ) AS count__discussions,
        (
          SELECT COUNT(DISTINCT candidate_post.id)::bigint
          FROM posts candidate_post
          JOIN posts root_post
            ON root_post.id = COALESCE(candidate_post.root_id, candidate_post.id)
          JOIN post_review_topic_ratings prtr
            ON prtr.post_id = candidate_post.id
           AND prtr.topic_id = ${topicId}
          WHERE candidate_post.post_type = 'review'
            AND `)
  query.append(eligibility).append(sql`
        ) AS count__reviews,
        (
          SELECT COUNT(DISTINCT candidate_post.id)::bigint
          FROM posts candidate_post
          JOIN posts root_post
            ON root_post.id = COALESCE(candidate_post.root_id, candidate_post.id)
          JOIN post_data_point_topics pdpt
            ON pdpt.post_id = candidate_post.id
           AND pdpt.topic_id = ${topicId}
          WHERE candidate_post.post_type = 'data_point'
            AND `)
  query.append(eligibility).append(sql`
        ) AS count__data_points
    `)
  const { rows } = await read(query, options)

  const row = rows[0] ?? {}

  return {
    discussions: Number(row.count__discussions) || 0,
    reviews: Number(row.count__reviews) || 0,
    'data-points': Number(row.count__data_points) || 0,
  }
}
