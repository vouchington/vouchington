import sql, { type SQLStatement } from 'sql-template-strings'
import {
  buildViewerPostDiscoveryEligibilityFilter,
  buildHotScoreExpression,
  buildTopicMembershipExists,
  buildTopicAliasMembershipExists,
  buildUniversalTopicPostCandidatePairsSelect,
} from '@modules/feed-query-builders'
import type { PrivateUser } from '@services/users/types'
import type { PostFeedOptions } from '../../types.mts'
import {
  POST_TOPIC_CATEGORY_RELATION_TABLE,
  POST_TOPIC_ALIAS_CATEGORY_RELATION_TABLE,
} from '@services/entity-relations/metadata'

export function appendEligiblePostsCTE(
  query: SQLStatement,
  {
    currentUser,
    postTypes,
    sort,
    textSearchQuery,
    universalTopicIds,
    hashtagTopicIds,
    hashtagAliasIds,
    hasUnknownHashtag,
  }: {
    currentUser: Pick<PrivateUser, '__entity_type' | 'id' | 'roles'>
    postTypes: PostFeedOptions['post_types']
    sort: string
    textSearchQuery: PostFeedOptions['text_search_query']
    universalTopicIds: PostFeedOptions['universal_topic_ids']
    hashtagTopicIds: PostFeedOptions['hashtag_topic_ids']
    hashtagAliasIds: PostFeedOptions['hashtag_alias_ids']
    hasUnknownHashtag: PostFeedOptions['has_unknown_hashtag']
  },
): void {
  const discoveryEligibility = buildViewerPostDiscoveryEligibilityFilter('posts', 'root_post', {
    currentUserId: currentUser.id,
    isAdministrator: currentUser.roles.includes('administrator'),
  })
  query.append(sql`,
    eligible_posts AS NOT MATERIALIZED (
      SELECT
        posts.id,
        posts.post_type,
        posts.created_at,
        posts.created_by_id,
        posts.broadcast,
        posts.votes_score_net`)
  if (sort === 'hot')
    query
      .append(sql`,\n        `)
      .append(buildHotScoreExpression())
      .append(sql` AS hot_score`)
  query.append(sql`
      FROM posts
      JOIN posts root_post ON root_post.id = COALESCE(posts.root_id, posts.id)
      WHERE NOT EXISTS (
        SELECT 1 FROM hidden_posts WHERE hidden_posts.post_id = posts.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM excluded_users WHERE excluded_users.user_id = posts.created_by_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM `)
  query
    .append(POST_TOPIC_CATEGORY_RELATION_TABLE)
    .append(sql` AS post_topic_categories
        JOIN excluded_topics ON excluded_topics.topic_id = post_topic_categories.object_id
        WHERE post_topic_categories.subject_id = posts.id
          AND post_topic_categories.deleted_at IS NULL
          AND post_topic_categories.votes_score_net > 0
      )
      AND NOT EXISTS (
        SELECT 1
        FROM post_review_topic_ratings
        JOIN excluded_topics ON excluded_topics.topic_id = post_review_topic_ratings.topic_id
        WHERE post_review_topic_ratings.post_id = posts.id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM `)
    .append(POST_TOPIC_ALIAS_CATEGORY_RELATION_TABLE).append(sql` post_alias
        JOIN topic_aliases ON topic_aliases.id = post_alias.object_id
        JOIN excluded_topics ON excluded_topics.topic_id = topic_aliases.topic_id
        WHERE post_alias.subject_id = posts.id
          AND post_alias.deleted_at IS NULL
          AND post_alias.votes_score_net > 0
      )
      AND posts.community_id IS NULL
      AND `)
  query.append(discoveryEligibility).append(sql`
      AND NOT EXISTS (
        SELECT 1
        FROM relation__post__related__url pru
        JOIN urls ON urls.id = pru.object_id
        WHERE pru.subject_id = posts.id
          AND pru.deleted_at IS NULL
          AND pru.votes_score_net > 0
          AND urls.hostname_id IN (SELECT hostname_id FROM excluded_hostname_ids)
      )
  `)
  if (postTypes?.length) {
    query.append(sql`
      AND posts.post_type = ANY(${postTypes})
    `)
  } else {
    query.append(sql`
      AND posts.post_type NOT IN ('article', 'comment', 'topic_recommendation')
    `)
  }
  if (textSearchQuery?.trim()) {
    query.append(sql`
      AND posts.search_vector @@ websearch_to_tsquery('voucha_english', ${textSearchQuery.trim()})
    `)
  }
  if (hasUnknownHashtag) query.append(sql`\n      AND FALSE`)
  for (const topicId of [...new Set(hashtagTopicIds ?? [])]) {
    query.append(sql`\n      AND `).append(buildTopicMembershipExists('posts.id', topicId))
  }
  for (const aliasId of [...new Set(hashtagAliasIds ?? [])]) {
    query.append(sql`\n      AND `).append(buildTopicAliasMembershipExists('posts.id', aliasId))
  }
  const uniqueUniversalTopicIds = [...new Set(universalTopicIds)]
  if (uniqueUniversalTopicIds.length > 0) {
    query
      .append(sql`
      AND posts.id IN (
        SELECT universal_topic_candidates.post_id
        FROM (`)
      .append(buildUniversalTopicPostCandidatePairsSelect(uniqueUniversalTopicIds))
      .append(sql`) universal_topic_candidates
        GROUP BY universal_topic_candidates.post_id
        HAVING COUNT(*) = ${uniqueUniversalTopicIds.length}
      )
    `)
  }
  query.append(sql`
    )`)
}
