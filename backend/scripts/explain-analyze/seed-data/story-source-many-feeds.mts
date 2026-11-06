import { write } from '@data-stores/psql'
import { seedUuid } from './common.mts'

const MANY_FEED_STORY_CARRIERS = 1_000

/** One story on the newest visible feed plus 1000 older feeds. The owner probe must stop at one source. */
export async function seedStoryCarriedByManyFeeds(initiatedById: string): Promise<void> {
  const storyId = seedUuid(900_000, '17')
  const postId = seedUuid(900_000, '05')
  const newest = await write<{ feed_id: string; item_id: string }>(
    `/* seedStoryCarriedByManyFeeds:newest */ SELECT src.rss_feed_id AS feed_id, src.rss_feed_item_id AS item_id
     FROM rss_feed_item_sources src
     JOIN rss_feeds feed ON feed.id = src.rss_feed_id
     WHERE feed.is_enabled AND feed.is_discoverable AND feed.deleted_at IS NULL
     ORDER BY feed.id DESC, src.rss_feed_item_id DESC
     LIMIT 1`,
  )
  const row = newest.rows[0]
  if (!row) throw new Error('many-feed story seed found no visible feed item')
  await write(
    `/* seedStoryCarriedByManyFeeds:story */ INSERT INTO stories (id, title)
     VALUES ($1::uuid, 'Many-feed story page') ON CONFLICT (id) DO NOTHING`,
    [storyId],
  )
  await write(
    `/* seedStoryCarriedByManyFeeds:assign */ UPDATE rss_feed_items SET story_id = $1::uuid WHERE id = $2::uuid`,
    [storyId, row.item_id],
  )
  await write(
    `/* seedStoryCarriedByManyFeeds:carriers */ INSERT INTO rss_feed_item_sources
       (rss_feed_id, rss_feed_item_id, published_at)
     SELECT feed.id, $1::uuid, '2000-01-01T00:00:00Z'
     FROM rss_feeds feed
     WHERE feed.is_enabled AND feed.is_discoverable AND feed.deleted_at IS NULL
       AND feed.id < $2::uuid
     ORDER BY feed.id DESC
     LIMIT $3
     ON CONFLICT DO NOTHING`,
    [row.item_id, row.feed_id, MANY_FEED_STORY_CARRIERS],
  )
  await write(
    `/* seedStoryCarriedByManyFeeds:bump */ UPDATE rss_feed_item_sources
     SET published_at = '9999-01-01T00:00:00Z'
     WHERE rss_feed_id = $1::uuid AND rss_feed_item_id = $2::uuid`,
    [row.feed_id, row.item_id],
  )
  await write(
    `/* seedStoryCarriedByManyFeeds:post */ INSERT INTO posts (
       id, created_via, post_type, title,
       bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256)
     VALUES ($1::uuid, 'system', 'story', 'Many-feed story page',
       decode(repeat('ab', 32), 'hex'), decode(repeat('ab', 32), 'hex'))
     ON CONFLICT (id) DO NOTHING`,
    [postId],
  )
  await write(
    `/* seedStoryCarriedByManyFeeds:link */ INSERT INTO story_posts (post_id, story_id, initiated_by_id)
     VALUES ($1::uuid, $2::uuid, $3::uuid) ON CONFLICT DO NOTHING`,
    [postId, storyId, initiatedById],
  )
  const counted = await write<{ count: string }>(
    `/* seedStoryCarriedByManyFeeds:count */ SELECT COUNT(*)::text AS count
     FROM rss_feed_item_sources WHERE story_id = $1::uuid`,
    [storyId],
  )
  const count = Number(counted.rows[0]?.count ?? 0)
  if (count < MANY_FEED_STORY_CARRIERS) {
    throw new Error(
      `many-feed story seed expected at least ${MANY_FEED_STORY_CARRIERS} sources, found ${count}`,
    )
  }
  // stories and story_posts stay out of this ANALYZE. Refreshing them changes the later
  // getStoryById point read off stories_pkey.
  await write(
    `/* seedStoryCarriedByManyFeeds:analyze */ ANALYZE rss_feed_item_sources, rss_feed_items`,
  )
}
