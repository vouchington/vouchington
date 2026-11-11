import sql, { type SQLStatement } from 'sql-template-strings'
import { buildHotScoreExpression } from '@modules/feed-query-builders/hot-score'
import {
  buildViewerPostDiscoveryEligibilityFilter,
  buildHostnameExclusionExists,
  buildTopicMembershipExists,
  buildTopicAliasMembershipExists,
  buildUniversalTopicMembershipExists,
} from '@modules/feed-query-builders'
import type { PrivateUser } from '@services/users/types'
import type { PostFeedOptions } from '../../types.mts'
import {
  POST_TOPIC_CATEGORY_RELATION_TABLE,
  POST_TOPIC_ALIAS_CATEGORY_RELATION_TABLE,
} from '@services/entity-relations/metadata'

export type PostFeedWalkSort = 'new' | 'hot' | 'best'

export type PostFeedEligibilityOptions = {
  currentUser: Pick<PrivateUser, '__entity_type' | 'id' | 'roles'>
  postTypes: PostFeedOptions['post_types']
  sort: PostFeedWalkSort
  scoreReferenceDate?: Date
  textSearchQuery: PostFeedOptions['text_search_query']
  universalTopicIds: PostFeedOptions['universal_topic_ids']
  hashtagTopicIds: PostFeedOptions['hashtag_topic_ids']
  hashtagAliasIds: PostFeedOptions['hashtag_alias_ids']
  hasUnknownHashtag: PostFeedOptions['has_unknown_hashtag']
}

export function appendEligiblePostsCTE(
  query: SQLStatement,
  options: PostFeedEligibilityOptions,
): void {
  query.append(sql`, eligible_posts AS NOT MATERIALIZED (`)
  appendEligiblePostsSelect(query, options)
  query.append(sql`)`)
}

export function appendEligiblePostsSelect(
  query: SQLStatement,
  {
    currentUser,
    postTypes,
    sort,
    scoreReferenceDate,
    textSearchQuery,
    universalTopicIds,
    hashtagTopicIds,
    hashtagAliasIds,
    hasUnknownHashtag,
  }: PostFeedEligibilityOptions,
  targetPostId?: SQLStatement,
): void {
  const discoveryEligibility = buildViewerPostDiscoveryEligibilityFilter('posts', 'root_post', {
    currentUserId: currentUser.id,
    isAdministrator: currentUser.roles.includes('administrator'),
  })
  query.append(sql`
      SELECT
        posts.id,
        posts.post_type,
        posts.created_at,
        posts.created_by_id,
        posts.broadcast,
        posts.votes_score_net,
        posts.votes_score_sort`)
  if (sort === 'hot')
    query
      .append(sql`,\n        `)
      .append(buildHotScoreExpression('posts', scoreReferenceDate))
      .append(sql` AS hot_score`)
  const uniqueUniversalTopicIds = [...new Set(universalTopicIds ?? [])]
  query.append(sql`
      FROM posts`)
  query.append(sql`
      JOIN posts root_post ON root_post.id = COALESCE(posts.root_post_id, posts.id)
      WHERE 1 = 1`)
  if (targetPostId) query.append(sql` AND posts.id = `).append(targetPostId)
  query.append(sql` AND `).append(hotScoreEligibilityFilter(sort))
  // `hide` on a comment only collapses it in its thread. Feeds exclude comments unless a caller asks
  // for them, so the comment exemption is added only then and the usual anti-join stays plain.
  const hiddenPostCheck = sql`NOT EXISTS (
        SELECT 1 FROM hidden_posts WHERE hidden_posts.post_id = posts.id
      )`
  query.append(sql`
      AND `)
  query.append(
    postTypes?.includes('comment')
      ? sql`(posts.post_type = 'comment' OR `.append(hiddenPostCheck).append(sql`)`)
      : hiddenPostCheck,
  )
  query.append(sql`
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
  query
    .append(discoveryEligibility)
    .append(sql`
      AND NOT EXISTS (
        SELECT 1
        FROM relation__post__related__url pru
        JOIN urls ON urls.id = pru.object_id
        JOIN url_hostnames blocked_hostname ON blocked_hostname.id = urls.hostname_id
        WHERE pru.subject_id = posts.id
          AND pru.deleted_at IS NULL
          AND pru.votes_score_net > 0
          AND (`)
    .append(
      buildHostnameExclusionExists(
        currentUser.id,
        sql`blocked_hostname.id`,
        sql`blocked_hostname.reversed_hostname`,
      ),
    ).append(sql` OR blocked_hostname.is_blocked)
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
  for (const topicId of uniqueUniversalTopicIds) {
    query
      .append(sql`
      AND `)
      .append(buildUniversalTopicMembershipExists('posts.id', topicId))
  }
}

function hotScoreEligibilityFilter(sort: PostFeedWalkSort): SQLStatement {
  // Ranked walks read only positively voted posts. `best` also names the partial index it walks.
  return sort === 'new' ? sql`TRUE` : sql`posts.votes_score_net > 0 AND posts.deleted_at IS NULL`
}
