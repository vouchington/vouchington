import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { beginTransaction, type QueryExecutor } from '@data-stores/psql'
import { contentHash, seedUuid } from '../seed-data/common.mts'

export async function seedRssHardDeleteSourceCapacity(limit: number) {
  const prefix = `explain-rss-hard-delete-${randomUUID()}`
  const names = [`${prefix}-target`, `${prefix}-other`]
  const hostId = seedUuid(0, '02')
  const authorId = seedUuid(0, '01')
  const hash = contentHash(prefix)
  await using query = await beginTransaction()
  const { rows: feeds } = await query<{
    id: string
    url_id: string
    topic_id: string
    title: string
  }>(
    `/* seedRssHardDeleteSourceCapacityFeeds */
     WITH feed_urls AS (
       INSERT INTO urls (hostname_id, url, pathname, search_params)
       SELECT $1::uuid, 'https://seed-host-0.example.com/' || name, '/' || name, '{}'::jsonb
       FROM unnest($2::text[]) AS input(name)
       RETURNING id, pathname
     ), feed_topics AS (
       INSERT INTO topics (name, slug, bedrock_nova_multimodal_v1_content_sha256, created_via)
       SELECT name, name, $3, 'system' FROM unnest($2::text[]) AS input(name)
       RETURNING id, slug
     )
     INSERT INTO rss_feeds (rss_feed_url_id, topic_id, title, created_via)
     SELECT feed_urls.id, feed_topics.id, feed_topics.slug, 'system'
     FROM feed_topics JOIN feed_urls ON feed_urls.pathname = '/' || feed_topics.slug
     RETURNING id, rss_feed_url_id AS url_id, topic_id, title`,
    [hostId, names, hash],
  )
  const [target, other] = names.map(name => {
    const feed = feeds.find(row => row.title === name)
    assert.ok(feed)
    return feed
  })
  assert.ok(target)
  assert.ok(other)
  const { rows: items } = await query<{ id: string }>(
    `/* seedRssHardDeleteSourceCapacityItems */
     WITH identities AS (
       INSERT INTO rss_feed_item_guids (url_hostname_id, guid)
       SELECT $1::uuid, $2::text || '-' || n FROM generate_series(1, $3::int) AS input(n)
       RETURNING id
     )
     INSERT INTO rss_feed_items (id, url_id, data, bedrock_nova_multimodal_v1_content_sha256)
     SELECT id, $4::uuid, jsonb_build_object('title', 'Explain RSS hard-delete item ' || id), $5
     FROM identities RETURNING id`,
    [hostId, prefix, limit + 2, target.url_id, hash],
  )
  const ids = items.map(row => row.id).toSorted()
  assert.equal(ids.length, limit + 2)
  const targetIds = ids.slice(0, limit + 1)
  const otherIds = [ids[0]!, ids.at(-1)!]
  const { rows: linkedPosts } = await query<{ post_id: string; story_id: string }>(
    `/* seedRssHardDeleteSourceCapacityStoryPost */
     WITH story AS (
       INSERT INTO stories (title) VALUES ('Explain RSS hard-delete story') RETURNING id
     ), post AS (
       INSERT INTO posts (
         post_type, title, markdown, created_by_id, bedrock_nova_multimodal_v1_content_sha256,
         llm_moderation_content_sha256, created_via
       )
       VALUES ('story', 'Explain RSS hard-delete post', '', $1, $2, $2, 'system') RETURNING id
     ), items AS (
       UPDATE rss_feed_items SET story_id = story.id
       FROM story WHERE rss_feed_items.id = ANY($3::uuid[])
     )
     INSERT INTO story_posts (post_id, story_id, initiated_by_id)
     SELECT post.id, story.id, $1 FROM post CROSS JOIN story
     RETURNING post_id, story_id`,
    [authorId, hash, [targetIds[0]!, targetIds.at(-1)!]],
  )
  const linked = linkedPosts[0]!
  await insertSources(query, [
    { feedId: target.id, itemIds: targetIds },
    { feedId: other.id, itemIds: otherIds },
  ])
  await query(
    `/* markRssHardDeleteSourceCapacityFeed */
     UPDATE rss_feeds SET deleted_at = CURRENT_TIMESTAMP, hard_delete_requested_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [target.id],
  )
  await query.commit()
  return { target, other, targetIds, otherIds, ids, ...linked }
}

export type RssHardDeleteSourceCapacityFixture = Awaited<
  ReturnType<typeof seedRssHardDeleteSourceCapacity>
>

export async function restoreRssHardDeleteSourceCapacity(
  fixture: RssHardDeleteSourceCapacityFixture,
) {
  await using query = await beginTransaction()
  await query(
    `/* restoreRssHardDeleteSourceCapacityReconciliations */
     DELETE FROM rss_feed_item_category_snapshot_reconciliations WHERE rss_feed_item_id = ANY($1::uuid[])`,
    [fixture.targetIds],
  )
  await insertSources(query, [{ feedId: fixture.target.id, itemIds: fixture.targetIds }])
  await query.commit()
}

async function insertSources(
  query: QueryExecutor,
  feeds: ReadonlyArray<{ feedId: string; itemIds: string[] }>,
): Promise<void> {
  await query(
    `/* seedRssHardDeleteSourceCapacityAssociations */
     WITH sources AS (
       INSERT INTO rss_feed_item_sources (rss_feed_id, rss_feed_item_id, published_at)
       SELECT feed_id, item_id, uuid_extract_timestamp(item_id)
       FROM unnest($1::uuid[], $2::uuid[]) AS input(feed_id, item_id)
       RETURNING rss_feed_id, rss_feed_item_id
     )
     INSERT INTO rss_feed_item_source_category_snapshots (rss_feed_id, rss_feed_item_id, categories)
     SELECT rss_feed_id, rss_feed_item_id, '["rss hard-delete category"]'::jsonb FROM sources`,
    [
      feeds.flatMap(feed => feed.itemIds.map(() => feed.feedId)),
      feeds.flatMap(feed => feed.itemIds),
    ],
  )
}

export async function cleanupRssHardDeleteSourceCapacity(
  fixture: RssHardDeleteSourceCapacityFixture,
) {
  await using query = await beginTransaction()
  await query(
    '/* cleanupRssHardDeleteSourceCapacityFeeds */ DELETE FROM rss_feeds WHERE id = ANY($1::uuid[])',
    [[fixture.target.id, fixture.other.id]],
  )
  await query(
    '/* cleanupRssHardDeleteSourceCapacityItems */ DELETE FROM rss_feed_item_guids WHERE id = ANY($1::uuid[])',
    [fixture.ids],
  )
  await query(
    `/* cleanupRssHardDeleteSourceCapacityRetainedItems */
     DELETE FROM retained_rss_feed_item_identities WHERE id = ANY($1::uuid[])`,
    [fixture.ids],
  )
  await query(
    `/* cleanupRssHardDeleteSourceCapacityPost */
     WITH removed AS (DELETE FROM posts WHERE id = $1 RETURNING id)
     DELETE FROM retained_post_identities identity USING removed WHERE identity.id = removed.id`,
    [fixture.post_id],
  )
  await query('/* cleanupRssHardDeleteSourceCapacityStory */ DELETE FROM stories WHERE id = $1', [
    fixture.story_id,
  ])
  await query(
    `/* cleanupRssHardDeleteSourceCapacityTopicsAndUrls */
     WITH removed_urls AS (DELETE FROM urls WHERE id = ANY($1::uuid[])),
       removed_topics AS (DELETE FROM topics WHERE id = ANY($2::uuid[]) RETURNING id)
     DELETE FROM retained_topic_identities identity USING removed_topics WHERE identity.id = removed_topics.id`,
    [
      [fixture.target.url_id, fixture.other.url_id],
      [fixture.target.topic_id, fixture.other.topic_id],
    ],
  )
  await query.commit()
}
