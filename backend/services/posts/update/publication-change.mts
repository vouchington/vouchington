import type { TransactionQuery } from '@data-stores/psql'
import { recordPostPublicationChange } from '@services/post-publication'
import type { Post, UpdatePostChanges } from '../types.mts'

// Scoped to topic ids that can shift as a side effect of updatePost() changing
// categories/structured_data. Direct relation__post__category__topic membership and
// post_review_topic_ratings are intentionally excluded: updatePost() never writes those
// tables, and their own write sites (runRelationPublicationMutation, post-ratings CRUD)
// already record their own impactedTopicIds.
export async function getPreviousPostPublicationTopicIds(
  query: TransactionQuery,
  postId: string,
  shouldLoad: boolean,
): Promise<string[]> {
  if (!shouldLoad) return []

  const { rows } = await query<{ topic_id: string }>(
    `/* updatePost:previousPublicationTopics */
    SELECT DISTINCT topic_id FROM (
      SELECT topic_id FROM post_explicit_topic_categories WHERE post_id = $1
      UNION ALL
      SELECT topic_id FROM post_data_point_topics WHERE post_id = $1
      UNION ALL
      SELECT aliases.topic_id
      FROM post_topic_alias_sources sources
      JOIN topic_aliases aliases ON aliases.id = sources.topic_alias_id
      WHERE sources.post_id = $1 AND aliases.topic_id IS NOT NULL
      UNION ALL
      SELECT aliases.topic_id
      FROM relation__post__category__topic_alias relation
      JOIN topic_aliases aliases ON aliases.id = relation.object_id
      WHERE relation.subject_id = $1
        AND relation.deleted_at IS NULL
        AND relation.votes_score_net > 0
        AND aliases.topic_id IS NOT NULL
    ) topics`,
    [postId],
  )
  return rows.map(row => row.topic_id)
}

export async function recordPostUpdatePublicationChanges(
  query: TransactionQuery,
  params: {
    changed: boolean
    changes: UpdatePostChanges
    contentChanged: boolean
    post: Post
    previousTopicIds: string[]
    syncHashtagCategories: boolean
  },
): Promise<void> {
  const { changed, changes, contentChanged, post, previousTopicIds, syncHashtagCategories } = params
  const footprint = {
    priorAuthorUserId: post.created_by_id ?? undefined,
    priorCommunityId: post.community_id ?? undefined,
    priorRootId: post.root_id ?? undefined,
    priorPostSlug: post.slug ?? undefined,
  }
  const reason = getPostUpdatePublicationReason({ changed, changes, contentChanged })
  if (reason) {
    await recordPostPublicationChange(query, {
      scope: { type: 'post', postId: post.id },
      reason,
      footprint,
    })
  }

  const topicsChanged = changes.categories !== undefined || changes.structured_data !== undefined
  if (!topicsChanged && !syncHashtagCategories) return
  await recordPostPublicationChange(query, {
    scope: { type: 'post', postId: post.id },
    reason: 'post_topics_changed',
    impactedTopicIds: previousTopicIds,
    footprint,
  })
}

function getPostUpdatePublicationReason({
  changed,
  changes,
  contentChanged,
}: {
  changed: boolean
  changes: UpdatePostChanges
  contentChanged: boolean
}) {
  if (contentChanged) return 'post_content_reset' as const
  if (changes.privacy !== undefined || changes.broadcast !== undefined) {
    return 'post_audience_changed' as const
  }
  if (changed || changes.archive !== undefined) return 'post_updated' as const
  return undefined
}
