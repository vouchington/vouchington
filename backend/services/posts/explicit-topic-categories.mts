import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import type { CreatePostUpdates } from './types.mts'
import sql from 'sql-template-strings'
import { withTopicReferenceAttachmentFences } from '@services/post-publication/lock'

export async function syncPostExplicitTopicCategoriesInTransaction(
  postId: string,
  categories: CreatePostUpdates['categories'],
  options: QueryOptions,
): Promise<void> {
  if (categories === undefined) return
  const topicIds = getExplicitTopicCategoryIds(categories)
  await withTopicReferenceAttachmentFences(topicIds, options, async query => {
    await write(
      sql`/* syncPostExplicitTopicCategoriesInTransaction.clear */
      DELETE FROM post_explicit_topic_categories WHERE post_id = ${postId}`,
      { query },
    )
    if (topicIds.length === 0) return
    await write(
      sql`/* syncPostExplicitTopicCategoriesInTransaction.insert */
      INSERT INTO post_explicit_topic_categories (post_id, topic_id)
      SELECT ${postId}, topic_id
      FROM UNNEST(${topicIds}::uuid[]) AS input(topic_id)`,
      { query },
    )
  })
}

export function getExplicitTopicCategoryIds(
  categories: NonNullable<CreatePostUpdates['categories']>,
): string[] {
  return [
    ...new Set(
      categories.flatMap(category => (category.type === 'topic' ? [category.topic_id] : [])),
    ),
  ]
}
