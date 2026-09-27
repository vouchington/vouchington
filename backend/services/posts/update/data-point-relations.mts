import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { persistPostDataPointFacts } from '@services/data-points/persist-facts'
import sql from 'sql-template-strings'
import type { StructuredDataPoint } from '@voucha/types/entities/data-point'
import { insertPostDataPointTopics } from '../data-point-topics.mts'
import type { Post, UpdatePostChanges } from '../types.mts'

export async function syncPostDataPointTopicsInTransaction(
  post: Post,
  changes: UpdatePostChanges,
  options: QueryOptions,
) {
  if (changes.structured_data === undefined || post.post_type !== 'data_point') return

  const structuredData = changes.structured_data as StructuredDataPoint
  await persistPostDataPointFacts(post.id, structuredData, options)
  const newTopicIds = structuredData.topic_ids
  await write(
    sql`/* updatePost:syncDataPointTopics */
      DELETE FROM post_data_point_topics WHERE post_id = ${post.id}`,
    options,
  )
  await insertPostDataPointTopics(post.id, newTopicIds, options)
}
