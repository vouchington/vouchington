import { read, beginTransaction, write } from '@data-stores/psql'
import { insertTestCentralizedEmbeddingsBulk } from './_bedrock-embeddings-support.mts'
import sql from 'sql-template-strings'
import pgvector from 'pgvector/pg'
import { v7 as uuidv7 } from 'uuid'
import { makeRandomEmbedding } from './embeddings.mts'

export async function getTestRssFeedUrlHostnameId(rssFeedId: string): Promise<string> {
  const { rows } = await read(sql`/* getTestRssFeedUrlHostnameId */
    SELECT urls.hostname_id AS url_hostname_id
    FROM rss_feeds
    JOIN urls ON urls.id = rss_feeds.rss_feed_url_id
    WHERE rss_feeds.id = ${rssFeedId}
    LIMIT 1
  `)
  if (!rows[0]) throw new Error(`insertTestRssFeedItem: RSS feed not found: ${rssFeedId}`)
  return rows[0].url_hostname_id as string
}

export async function insertTestRssFeedItem(data: {
  id?: string
  rssFeedId: string
  urlId: string
  guid: string
  itemData: unknown
  contentSha256: Buffer
  embeddingSha256?: Buffer
  embedding?: number[]
  tokens?: number
  createdAt?: Date
}): Promise<string> {
  const urlHostnameId = await getTestRssFeedUrlHostnameId(data.rssFeedId)
  const id = data.id ?? (data.createdAt ? uuidv7({ msecs: data.createdAt.getTime() }) : null)

  const inputSha = data.embeddingSha256 || data.contentSha256
  if (data.embedding && data.tokens !== undefined) {
    await insertTestCentralizedEmbeddingsBulk([
      {
        content_sha256: inputSha,
        embedding: data.embedding,
      },
    ])
  }

  await using transaction = await beginTransaction()
  const { rows: identityRows } = await transaction(sql`
        INSERT INTO rss_feed_item_ids (id, url_hostname_id, guid)
        VALUES (COALESCE(${id}::uuid, uuidv7()), ${urlHostnameId}, ${data.guid})
        ON CONFLICT (url_hostname_id, guid) DO UPDATE
          SET guid = EXCLUDED.guid
        RETURNING id
      `)
  const itemId = identityRows[0].id as string

  if (data.embedding && data.tokens !== undefined) {
    await transaction(sql`
          INSERT INTO rss_feed_items (
            id,
            url_id,
            data,
            bedrock_nova_multimodal_v1_content_sha256,
            bedrock_nova_multimodal_v1_input_sha256,
            bedrock_nova_multimodal_v1_embedding,
            bedrock_nova_multimodal_v1_embedding_created_at
          ) VALUES (
            ${itemId},
            ${data.urlId},
            ${JSON.stringify(data.itemData)}::jsonb,
            ${data.contentSha256},
            ${inputSha},
            ${pgvector.toSql(data.embedding)},
            CURRENT_TIMESTAMP
          )
          ON CONFLICT (id) DO UPDATE
            SET data = EXCLUDED.data
        `)
  } else {
    await transaction(sql`
          INSERT INTO rss_feed_items (
            id,
            url_id,
            data,
            bedrock_nova_multimodal_v1_content_sha256
          ) VALUES (
            ${itemId},
            ${data.urlId},
            ${JSON.stringify(data.itemData)}::jsonb,
            ${data.contentSha256}
          )
          ON CONFLICT (id) DO UPDATE
            SET data = EXCLUDED.data
        `)
  }

  await transaction(sql`
    INSERT INTO rss_feed_item_sources (rss_feed_id, rss_feed_item_id, published_at)
    VALUES (
      ${data.rssFeedId},
      ${itemId},
      (SELECT published_at FROM rss_feed_items WHERE id = ${itemId})
    )
    ON CONFLICT DO NOTHING
  `)

  await transaction.commit()
  return itemId
}

export async function addDummyEmbeddingToRssFeedItem(
  rssFeedItemId: string,
  options?: { embedding?: number[] },
): Promise<void> {
  const vector = options?.embedding ?? makeRandomEmbedding()
  const dummyEmbedding = `[${vector.join(',')}]`
  await write(sql`
    UPDATE rss_feed_items
    SET bedrock_nova_multimodal_v1_embedding = ${dummyEmbedding}::vector,
        bedrock_nova_multimodal_v1_embedding_created_at = CURRENT_TIMESTAMP
    WHERE id = ${rssFeedItemId}
  `)
}

export async function addCategoryToRssFeedItem(
  rssFeedItemId: string,
  topicId: string,
  categoryText = 'test-category',
): Promise<void> {
  await write(sql`
    INSERT INTO rss_feed_item_categories (rss_feed_item_id, category_text, topic_id)
    VALUES (${rssFeedItemId}, ${categoryText}, ${topicId})
    ON CONFLICT DO NOTHING
  `)
}

export async function addTopicAliasCategoryToRssFeedItem(
  rssFeedItemId: string,
  topicAliasId: string,
  categoryText = 'test-alias-category',
): Promise<void> {
  await write(sql`
    INSERT INTO rss_feed_item_categories (rss_feed_item_id, category_text, topic_alias_id)
    VALUES (${rssFeedItemId}, ${categoryText}, ${topicAliasId})
    ON CONFLICT DO NOTHING
  `)
}

export async function insertUnmappedRssFeedItemCategory(
  rssFeedItemId: string,
  categoryText: string,
): Promise<void> {
  await write(sql`
    INSERT INTO rss_feed_item_categories (rss_feed_item_id, category_text, topic_id)
    VALUES (${rssFeedItemId}, ${categoryText}, NULL)
    ON CONFLICT DO NOTHING
  `)
}

export async function setRssFeedItemMediaType(
  itemId: string,
  mediaType: 'article' | 'audio' | 'video',
): Promise<void> {
  await write(sql`
    UPDATE rss_feed_items SET media_type = ${mediaType}::rss_feed_item_media_types WHERE id = ${itemId}
  `)
}

export async function setRssFeedItemVideoMetadata(
  itemId: string,
  options: { videoId: string; videoPlatform: string },
): Promise<void> {
  await write(
    sql`UPDATE rss_feed_items SET media_type = 'video', video_id = ${options.videoId}, video_platform = ${options.videoPlatform} WHERE id = ${itemId}`,
  )
}

/** Add a second (or additional) source feed for an existing RSS feed item. */
export async function addRssFeedItemSource(feedId: string, itemId: string): Promise<void> {
  await write(sql`
    INSERT INTO rss_feed_item_sources (rss_feed_id, rss_feed_item_id, published_at)
    VALUES (
      ${feedId},
      ${itemId},
      (SELECT published_at FROM rss_feed_items WHERE id = ${itemId})
    )
    ON CONFLICT DO NOTHING
  `)
}

export async function getRssFeedItemCategoryTopicRelationDeletedAt(
  rssFeedItemId: string,
  topicId: string,
): Promise<Date | null | undefined> {
  const { rows } = await read<{ deleted_at: Date | null }>(sql`
    SELECT deleted_at
    FROM relation__rss_feed_item__category__topic
    WHERE subject_id = ${rssFeedItemId}
      AND object_id = ${topicId}
  `)
  return rows[0]?.deleted_at
}
