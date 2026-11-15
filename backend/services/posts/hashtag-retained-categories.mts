import { MAX_MANUAL_TAGS, assertManualCategoryInputLimit } from '@services/tag-limits'
import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import type { CreatePostUpdates } from './types.mts'

export async function getRetainedPostCategories(
  postId: string,
  options?: QueryOptions,
): Promise<NonNullable<CreatePostUpdates['categories']>> {
  const [{ rows: topicRows }, { rows: hashtagRows }] = await Promise.all([
    write<{ topic_id: string }>(
      `/* getRetainedPostCategories topics */
      SELECT explicit.topic_id
      FROM post_explicit_topic_categories explicit
      JOIN topics topic ON topic.id = explicit.topic_id
      WHERE explicit.post_id = $1
        AND topic.deleted_at IS NULL
        AND topic.merged_into_topic_id IS NULL
      ORDER BY explicit.topic_id
      LIMIT $2
        `,
      [postId, MAX_MANUAL_TAGS + 1],
      options,
    ),
    write<{ hashtag: string }>(
      `/* getRetainedPostCategories hashtags */
      SELECT DISTINCT authored_token AS hashtag
      FROM post_topic_alias_sources
      WHERE post_id = $1 AND source = 'explicit'
      ORDER BY authored_token
      LIMIT $2`,
      [postId, MAX_MANUAL_TAGS + 1],
      options,
    ),
  ])
  assertManualCategoryInputLimit(topicRows.length + hashtagRows.length)
  return [
    ...topicRows.map(row => ({ type: 'topic' as const, topic_id: row.topic_id })),
    ...hashtagRows.map(row => ({ type: 'hashtag' as const, hashtag: row.hashtag })),
  ]
}
