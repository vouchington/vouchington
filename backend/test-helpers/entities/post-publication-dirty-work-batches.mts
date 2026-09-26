import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'

export async function insertTestPostBatch(createdById: string, count: number): Promise<string[]> {
  const sha256 = `\\x${'0'.repeat(64)}`
  const { rows } = await write<{ id: string }>(sql`
    /* insertTestPostBatch */
    INSERT INTO posts (
      id, post_type, title, markdown, created_by_id,
      bedrock_nova_multimodal_v1_content_sha256,
      llm_moderation_content_sha256,
      created_via
    )
    SELECT uuidv7(), 'discussion', 'Batch test post ' || series::text, '', ${createdById},
      ${sha256}, ${sha256}, 'system'
    FROM generate_series(1, ${count}) AS generated(series)
    RETURNING id
  `)
  return rows.map(row => row.id)
}

export async function insertTestPostTopicAliasSourceBatch(options: {
  postIds: readonly string[]
  topicAliasId: string
  contributorId: string
}): Promise<void> {
  await write(
    `/* insertTestPostTopicAliasSourceBatch */
    INSERT INTO post_topic_alias_sources
      (post_id, topic_alias_id, contributor_id, source, authored_token)
    SELECT post_id, $2::uuid, $3::uuid, 'explicit', '#bounded-alias'
    FROM UNNEST($1::uuid[]) AS post_id`,
    [options.postIds, options.topicAliasId, options.contributorId],
  )
}

export async function insertTestRssFeedItemSourceBatch(options: {
  count: number
  rssFeedId: string
  urlId: string
}): Promise<string[]> {
  const itemIds = Array.from({ length: options.count }, () => uuidv7())
  const guids = itemIds.map(id => `rss-impact-batch-${id}`)
  const sha256 = `\\x${'0'.repeat(64)}`
  await write(
    `/* insertTestRssFeedItemSourceBatch */
    WITH input AS (
      SELECT * FROM unnest($1::uuid[], $2::text[]) AS batch(item_id, guid)
    ), inserted_item_ids AS (
      INSERT INTO rss_feed_item_ids (id, url_hostname_id, guid)
      SELECT input.item_id, url.hostname_id, input.guid FROM input
      CROSS JOIN urls url WHERE url.id = $3
    ), inserted_items AS (
      INSERT INTO rss_feed_items (id, url_id, data, bedrock_nova_multimodal_v1_content_sha256)
      SELECT item_id, $3, '{}'::jsonb, $4 FROM input
      RETURNING id, published_at
    )
    INSERT INTO rss_feed_item_sources (rss_feed_id, rss_feed_item_id, published_at)
    SELECT $5, id, published_at FROM inserted_items`,
    [itemIds, guids, options.urlId, sha256, options.rssFeedId],
  )
  return itemIds
}

export async function insertTestStoryCategoryPublicationBatch(options: {
  count: number
  categoryText: string
  createdById: string
  rssFeedId: string
  topicId: string | null
  urlId: string
}): Promise<{ postIds: string[]; storyIds: string[] }> {
  const storyIds = Array.from({ length: options.count }, () => uuidv7())
  const itemIds = Array.from({ length: options.count }, () => uuidv7())
  const postIds = Array.from({ length: options.count }, () => uuidv7())
  const guids = itemIds.map(id => `publication-batch-${id}`)
  const sha256 = `\\x${'0'.repeat(64)}`
  await write(
    `/* insertTestStoryCategoryPublicationBatch */
    WITH input AS (
      SELECT * FROM unnest($1::uuid[], $2::uuid[], $3::uuid[], $4::text[])
        AS batch(story_id, item_id, post_id, guid)
    ), inserted_stories AS (
      INSERT INTO stories (id, title)
      SELECT story_id, 'Publication batch story ' || story_id::text FROM input
    ), inserted_item_ids AS (
      INSERT INTO rss_feed_item_ids (id, url_hostname_id, guid)
      SELECT input.item_id, url.hostname_id, input.guid FROM input
      CROSS JOIN urls url WHERE url.id = $5
    ), inserted_items AS (
      INSERT INTO rss_feed_items (id, url_id, data, bedrock_nova_multimodal_v1_content_sha256, story_id)
      SELECT item_id, $5, '{}'::jsonb, $6, story_id FROM input
      RETURNING id, published_at
    ), inserted_sources AS (
      INSERT INTO rss_feed_item_sources (rss_feed_id, rss_feed_item_id, published_at)
      SELECT $7, id, published_at FROM inserted_items
    ), inserted_categories AS (
      INSERT INTO rss_feed_item_categories (rss_feed_item_id, category_text, topic_id)
      SELECT item_id, $8, $9 FROM input
    ), inserted_posts AS (
      INSERT INTO posts (
        id, post_type, title, markdown, created_by_id,
        bedrock_nova_multimodal_v1_content_sha256,
        llm_moderation_content_sha256,
        created_via
      )
      SELECT post_id, 'story', 'Publication batch post ' || post_id::text, '', $10, $6, $6, 'system'
      FROM input
    )
    INSERT INTO post__stories (post_id, story_id, initiated_by_id)
    SELECT post_id, story_id, $10 FROM input`,
    [
      storyIds,
      itemIds,
      postIds,
      guids,
      options.urlId,
      sha256,
      options.rssFeedId,
      options.categoryText,
      options.topicId,
      options.createdById,
    ],
  )
  return { postIds, storyIds }
}
