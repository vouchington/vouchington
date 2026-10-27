import { read, write, type QueryInput, type TransactionQuery } from '@data-stores/psql'

export async function listExistingTestPostIds(postIds: readonly string[]): Promise<string[]> {
  const { rows } = await read<{ id: string }>(
    '/* listExistingTestPostIds */ SELECT id FROM posts WHERE id = ANY($1::uuid[]) ORDER BY id',
    [postIds],
  )
  return rows.map(row => row.id)
}

export async function readTestPostCreator(postId: string): Promise<string | null> {
  const { rows } = await read<{ created_by_id: string }>(
    '/* readTestPostCreator */ SELECT created_by_id FROM posts WHERE id = $1::uuid',
    [postId],
  )
  return rows[0]?.created_by_id ?? null
}

export async function lockTestPostRow(query: TransactionQuery, postId: string): Promise<void> {
  await query('/* lockTestPostRow */ SELECT id FROM posts WHERE id = $1::uuid FOR UPDATE', [postId])
}

export async function readTestStoryPostInitiator(postId: string): Promise<string | null> {
  const { rows } = await read<{ initiated_by_id: string }>(
    '/* readTestStoryPostInitiator */ SELECT initiated_by_id FROM story_posts WHERE post_id = $1::uuid',
    [postId],
  )
  return rows[0]?.initiated_by_id ?? null
}

export async function holdTestUserProfileRow(
  query: TransactionQuery,
  userId: string,
): Promise<void> {
  await query('/* holdTestUserProfileRow */ UPDATE users SET username = username WHERE id = $1', [
    userId,
  ])
}

export async function setTestLocalLockTimeout(query: TransactionQuery): Promise<void> {
  await query("/* setTestLocalLockTimeout */ SET LOCAL lock_timeout = '50ms'")
}

export async function deleteTestPostRow(query: TransactionQuery, postId: string): Promise<void> {
  await query('/* deleteTestPostRow */ DELETE FROM posts WHERE id = $1::uuid', [postId])
}

export async function readTestPostPreimageForUpdate(
  query: TransactionQuery,
  postId: string,
): Promise<{ created_at: Date; post_type: string } | null> {
  const { rows } = await query<{ created_at: Date; post_type: string }>(
    '/* readTestPostPreimageForUpdate */ SELECT created_at, post_type FROM posts WHERE id = $1::uuid FOR UPDATE',
    [postId],
  )
  return rows[0] ?? null
}

export async function deleteTestTopicAlias(
  query: TransactionQuery,
  aliasId: string,
): Promise<void> {
  await query('/* deleteTestTopicAlias */ DELETE FROM topic_aliases WHERE id = $1::uuid', [aliasId])
}

export async function readTestRssCategoryAliasTopic(
  itemId: string,
  aliasId: string,
): Promise<string | null> {
  const { rows } = await read<{ topic_id: string }>(
    `/* readTestRssCategoryAliasTopic */ SELECT alias.topic_id FROM rss_feed_item_categories category
     JOIN topic_aliases alias ON alias.id = category.topic_alias_id
     WHERE category.rss_feed_item_id = $1::uuid AND category.topic_alias_id = $2::uuid`,
    [itemId, aliasId],
  )
  return rows[0]?.topic_id ?? null
}

export async function countTestPostAliasRelations(
  postId: string,
  aliasId: string,
): Promise<number> {
  const { rows } = await read<{ count: number }>(
    `/* countTestPostAliasRelations */ SELECT COUNT(*)::integer AS count
     FROM relation__post__category__topic_alias WHERE subject_id = $1::uuid AND object_id = $2::uuid`,
    [postId, aliasId],
  )
  return rows[0]?.count ?? 0
}

export async function insertTestPostDataTopics(
  postId: string,
  topicIds: readonly string[],
): Promise<void> {
  await write(
    `/* insertTestPostDataTopics */ INSERT INTO post_data_point_topics (post_id, topic_id)
     SELECT $1::uuid, input.topic_id FROM unnest($2::uuid[]) input(topic_id)`,
    [postId, topicIds],
  )
}

export async function insertTestLiveRssFeedCategories(
  feedId: string,
  topicId: string,
  categoryIds: readonly string[],
): Promise<void> {
  await write(
    `/* insertTestLiveRssFeedCategories */ INSERT INTO rss_feed_categories
     (rss_feed_id, category_identity_id, topic_id)
     SELECT $1::uuid, identity_id, $2::uuid FROM unnest($3::uuid[]) AS input(identity_id)`,
    [feedId, topicId, categoryIds],
  )
}

export async function insertTestLiveRssItemCategories(
  itemId: string,
  topicId: string,
  categoryIds: readonly string[],
): Promise<void> {
  await write(
    `/* insertTestLiveRssItemCategories */ INSERT INTO rss_feed_item_categories
     (rss_feed_item_id, category_identity_id, category_text, topic_id)
     SELECT $1::uuid, identity_id, 'Live RSS identity', $2::uuid
     FROM unnest($3::uuid[]) AS input(identity_id)`,
    [itemId, topicId, categoryIds],
  )
}

export async function countTestFeedSources(feedId: string): Promise<number> {
  const { rows } = await read<{ count: number }>(
    '/* countTestFeedSources */ SELECT COUNT(*)::integer AS count FROM rss_feed_item_sources WHERE rss_feed_id = $1',
    [feedId],
  )
  return rows[0]?.count ?? 0
}

export function gateTestTopicAliasPublicationLockQuery(
  query: TransactionQuery,
  locked: PromiseWithResolvers<void>,
): TransactionQuery {
  const gated = (async (input: QueryInput, values?: ReadonlyArray<unknown>) => {
    const result = await query(input, values)
    const text = typeof input === 'string' ? input : input.text
    if (text.includes('lockTopicAliasPublicationCaptures')) locked.resolve()
    return result
  }) as TransactionQuery
  gated.client = query.client
  return gated
}

/** A retained alias can be claimed from an inactive owner by the normal link service. */
export async function markTestTopicInactiveKeepingAliases(topicId: string): Promise<void> {
  await write(
    `/* markTestTopicInactiveKeepingAliases */
    UPDATE topics SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1::uuid`,
    [topicId],
  )
}
