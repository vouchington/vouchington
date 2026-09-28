import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { insertPostDataPointTopics } from '../data-point-topics.mts'
import type { Post, UpdatePostChanges } from '../types.mts'

export async function syncPostDataPointTopicsInTransaction(
  post: Post,
  changes: UpdatePostChanges,
  options: QueryOptions,
) {
  if (changes.structured_data === undefined || post.post_type !== 'data_point') return

  const newTopicIds = (changes.structured_data as { topic_ids: string[] }).topic_ids
  await write(
    sql`/* updatePost:syncDataPointTopics */
      DELETE FROM post_data_point_topics WHERE post_id = ${post.id}`,
    options,
  )
  await insertPostDataPointTopics(post.id, newTopicIds, options)
}
