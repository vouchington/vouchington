import { write } from '@data-stores/psql'

/** Seed work only for stories owned by the calling test. */
export async function markTestStoryCategoryWork(storyIds: readonly string[]): Promise<void> {
  await write(
    `/* markTestStoryCategoryWork */ INSERT INTO story_post_category_projection_jobs (story_id)
     SELECT id FROM unnest($1::uuid[]) AS input(id) ORDER BY id
     ON CONFLICT (story_id) DO UPDATE SET generation = story_post_category_projection_jobs.generation + 1`,
    [[...storyIds]],
  )
}

export async function deleteTestStoryCategoryWork(storyIds: readonly string[]): Promise<void> {
  await write(
    '/* deleteTestStoryCategoryReceipts */ DELETE FROM story_post_category_projection_receipts WHERE story_id = ANY($1::uuid[])',
    [[...storyIds]],
  )
  await write(
    '/* deleteTestStoryCategoryWork */ DELETE FROM story_post_category_projection_jobs WHERE story_id = ANY($1::uuid[])',
    [[...storyIds]],
  )
}

export async function countTestStoryCategoryWork(storyIds: readonly string[]): Promise<number> {
  const { rows } = await write<{ count: number }>(
    '/* countTestStoryCategoryWork */ SELECT count(*)::int AS count FROM story_post_category_projection_jobs WHERE story_id = ANY($1::uuid[])',
    [[...storyIds]],
  )
  return rows[0]!.count
}

export async function assignTestStoryItemInTransaction(
  query: import('@data-stores/psql').TransactionQuery,
  itemId: string,
  storyId: string | null,
): Promise<void> {
  await query(
    '/* assignTestStoryItemInTransaction */ UPDATE rss_feed_items SET story_id = $2 WHERE id = $1',
    [itemId, storyId],
  )
}

export async function deleteTestStoryItemCategory(
  query: import('@data-stores/psql').TransactionQuery,
  itemId: string,
  topicId: string,
): Promise<void> {
  await query(
    '/* deleteTestStoryItemCategory */ DELETE FROM rss_feed_item_categories WHERE rss_feed_item_id = $1 AND topic_id = $2',
    [itemId, topicId],
  )
}

export async function getTestStoryCategoryVoteHistory(
  userId: string,
  relationId: string,
): Promise<Array<{ id: string; score: number | null }>> {
  const { rows } = await write<{ id: string; score: number | null }>(
    `/* getTestStoryCategoryVoteHistory */ SELECT id, score FROM relation__post__category__topic__votes
     WHERE user_id = $1 AND entity_relation_id = $2 ORDER BY id`,
    [userId, relationId],
  )
  return rows
}

export async function countTestStoryCategoryReceipts(
  storyId: string,
  topicId: string,
): Promise<number> {
  const { rows } = await write<{ count: number }>(
    '/* countTestStoryCategoryReceipts */ SELECT count(*)::int AS count FROM story_post_category_projection_receipts WHERE story_id = $1 AND topic_id = $2',
    [storyId, topicId],
  )
  return rows[0]!.count
}
