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
        AND topic.merged_into_topic_id IS NULL`,
      [postId],
      options,
    ),
    write<{ hashtag: string }>(
      `/* getRetainedPostCategories hashtags */
      SELECT DISTINCT authored_token AS hashtag
      FROM post_topic_alias_sources
      WHERE post_id = $1 AND source = 'explicit'`,
      [postId],
      options,
    ),
  ])
  return [
    ...topicRows.map(row => ({ type: 'topic' as const, topic_id: row.topic_id })),
    ...hashtagRows.map(row => ({ type: 'hashtag' as const, hashtag: row.hashtag })),
  ]
}
