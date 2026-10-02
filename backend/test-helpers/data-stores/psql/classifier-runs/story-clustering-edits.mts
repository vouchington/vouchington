import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createRssFeedItemEmbeddingContent } from '../../../../services/rss-feed-items/content.mts'

/** Moves the item to new content, so any receipt keyed on its previous content is stale. */
export async function reviseStoryClusteringItem(itemId: string): Promise<Buffer> {
  const title = `Story clustering revision ${randomUUID()}`
  const inputSha256 = createRssFeedItemEmbeddingContent({
    link: 'https://example.com',
    guid: `story-clustering-revision-${randomUUID()}`,
    title,
  }).content_sha256
  await write(sql`/* reviseStoryClusteringItemForTest */
    UPDATE rss_feed_items
    SET data = data || ${JSON.stringify({ title })}::jsonb,
        bedrock_nova_multimodal_v1_content_sha256 = ${inputSha256}
    WHERE id = ${itemId}`)
  return inputSha256
}

/**
 * Moves the item to new content and rebuilds its embedding at that content, as a re-upsert followed
 * by the embedder does, so the item is ready to cluster again at the new digest.
 */
export async function reviseAndEmbedStoryClusteringItem(itemId: string): Promise<Buffer> {
  const inputSha256 = await reviseStoryClusteringItem(itemId)
  await write(sql`/* embedRevisedStoryClusteringItemForTest */
    UPDATE rss_feed_items
    SET bedrock_nova_multimodal_v1_input_sha256 = bedrock_nova_multimodal_v1_content_sha256
    WHERE id = ${itemId}`)
  return inputSha256
}

/** Pins an admin's official item on the story, the lock no agent may override. */
export async function lockStoryOfficialItemForTest(storyId: string, itemId: string): Promise<void> {
  await write(sql`/* lockStoryOfficialItemForTest */
    UPDATE stories
    SET official_rss_feed_item_id = ${itemId}, official_locked_at = CURRENT_TIMESTAMP
    WHERE id = ${storyId}`)
}

/** Soft-deletes the feed item, as a retraction or admin deletion does. */
export async function softDeleteRssFeedItemForTest(itemId: string): Promise<void> {
  await write(sql`/* softDeleteRssFeedItemForTest */
    UPDATE rss_feed_items SET deleted_at = CURRENT_TIMESTAMP WHERE id = ${itemId}`)
}

/** Starts the story at the given time, which anchors the window its candidates are measured from. */
export async function setStoryPublishedAtForTest(
  storyId: string,
  publishedAt: Date,
): Promise<void> {
  await write(sql`/* setStoryPublishedAtForTest */
    UPDATE stories SET published_at = ${publishedAt} WHERE id = ${storyId}`)
}
