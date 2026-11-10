import { beginTransaction, withTransactionOptions, write } from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import type { CreatePostUpdates } from './types.mts'
import sql from 'sql-template-strings'

export async function syncPostExplicitTopicCategoriesInTransaction(
  postId: string,
  categories: CreatePostUpdates['categories'],
  options: QueryOptions,
): Promise<void> {
  if (categories === undefined) return
  const topicIds = getExplicitTopicCategoryIds(categories)
  const run = async (query: TransactionQuery) => {
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
  }
  if (options.query || options.client) return withTransactionOptions(options, run)
  await using query = await beginTransaction()
  await run(query)
  await query.commit()
}

function getExplicitTopicCategoryIds(
  categories: NonNullable<CreatePostUpdates['categories']>,
): string[] {
  return [
    ...new Set(
      categories.flatMap(category => (category.type === 'topic' ? [category.topic_id] : [])),
    ),
  ]
}
