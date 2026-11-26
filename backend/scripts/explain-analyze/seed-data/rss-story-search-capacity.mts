import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import pgvector from 'pgvector/pg'
import sql from 'sql-template-strings'
import { seedUuid } from './common.mts'

export const RSS_STORY_SEARCH_PAGE_SIZE = 100
export const STORY_MEMBER_COUNT = 5
export const SEMANTIC_QUERY_VECTOR = [1, ...Array<number>(1023).fill(0)]
const unrelatedVector = [0, 1, ...Array<number>(1022).fill(0)]
const unrelatedItems = 2_000

type Item = { id: string; story_id: string | null }

export async function seedRssStorySearchCapacity() {
  const cohort = `rss-story-capacity-${randomUUID()}`
  const hostnameId = seedUuid(0, '02')
  await using query = await beginTransaction()
  const {
    rows: [feed],
  } = await query<{ id: string; url_id: string }>(sql`/* seedExplainStoryCapacityFeed */
    WITH owner AS (
      INSERT INTO topics (name, slug, created_via, bedrock_nova_multimodal_v1_content_sha256)
      VALUES (${cohort}, ${cohort}, 'system', decode(repeat('00', 32), 'hex')) RETURNING id
    ), feed_url AS (
      INSERT INTO urls (url, hostname_id, search_params)
      VALUES (${`https://seed-host-0.example.com/${cohort}.xml`}, ${hostnameId}, '{}'::jsonb)
      RETURNING id
    )
    INSERT INTO rss_feeds (rss_feed_url_id, topic_id, title, created_via)
    SELECT feed_url.id, owner.id, ${cohort}, 'system' FROM feed_url CROSS JOIN owner
    RETURNING id, rss_feed_url_id AS url_id`)
  assert.ok(feed)
  await query(sql`/* seedExplainStoryCapacityFeedSettings */
    INSERT INTO rss_feed_setting_changes (change_type, rss_feed_id, is_enabled, reason)
    VALUES ('enablement', ${feed.id}, TRUE, 'EXPLAIN capacity source'),
      ('discoverability', ${feed.id}, TRUE, 'EXPLAIN capacity source')`)
  const { rows: stories } = await query<{ id: string }>(sql`/* seedExplainStoryCapacityStories */
    INSERT INTO stories (title)
    SELECT ${cohort} || ' ' || position.n
    FROM generate_series(1, ${RSS_STORY_SEARCH_PAGE_SIZE + 1}::int) position(n)
    RETURNING id`)
  const storyIds = stories.map(story => story.id)
  const itemStoryIds = storyIds.flatMap(id => Array<string>(STORY_MEMBER_COUNT).fill(id))
  const fixtureCount = itemStoryIds.length + unrelatedItems
  const { rows: items } = await query<Item>(sql`/* seedExplainStoryCapacityItems */
    WITH guids AS (
      INSERT INTO rss_feed_item_guids (url_hostname_id, guid)
      SELECT ${hostnameId}, ${cohort} || ':' || position.n
      FROM generate_series(1, ${fixtureCount}::int) position(n)
      RETURNING id, (split_part(guid, ':', 2))::int AS ordinal
    )
    INSERT INTO rss_feed_items (
      id, url_id, story_id, data, bedrock_nova_multimodal_v1_content_sha256,
      bedrock_nova_multimodal_v1_embedding
    )
    SELECT guid.id, ${feed.url_id}, story.id, jsonb_build_object('title', ${cohort}::text),
      decode(repeat('ab', 32), 'hex'),
      CASE WHEN story.id IS NULL THEN ${pgvector.toSql(unrelatedVector)}::vector
        ELSE ${pgvector.toSql(SEMANTIC_QUERY_VECTOR)}::vector END
    FROM guids guid
    LEFT JOIN unnest(${itemStoryIds}::uuid[]) WITH ORDINALITY AS story(id, ordinal)
      ON story.ordinal = guid.ordinal
    RETURNING id, story_id`)
  assert.equal(items.length, fixtureCount)
  await query(sql`/* seedExplainStoryCapacitySources */
    INSERT INTO rss_feed_item_sources (rss_feed_id, rss_feed_item_id, published_at)
    SELECT ${feed.id}, item.id, TIMESTAMPTZ '2025-01-01'
    FROM unnest(${items.map(item => item.id)}::uuid[]) AS item(id)`)
  await query.commit()
  await write('/* analyzeExplainStoryCapacity */ ANALYZE rss_feed_items, rss_feed_item_sources')
  const {
    rows: [feedCorpus],
  } = await write<{ count: number }>(sql`/* countExplainStorySearchFeedCorpus */
    SELECT count(*)::int AS count FROM rss_feeds`)
  assert.ok(feedCorpus)
  const membersByStory = Map.groupBy(
    items.filter(item => item.story_id !== null),
    item => item.story_id!,
  )
  return {
    feedId: feed.id,
    feedCount: feedCorpus.count,
    storyIds,
    itemIds: items.map(item => item.id),
    membersByStory: new Map(
      [...membersByStory].map(([id, members]) => [
        id,
        members
          .map(item => item.id)
          .toSorted()
          .toReversed(),
      ]),
    ),
  }
}

export async function removeRssStorySearchItems(
  fixture: Awaited<ReturnType<typeof seedRssStorySearchCapacity>>,
): Promise<void> {
  // Deleting owned GUIDs cascades to their RSS items and source associations.
  await write(sql`/* cleanupExplainStoryCapacityItems */
    DELETE FROM rss_feed_item_guids WHERE id = ANY(${fixture.itemIds}::uuid[])`)
  await write(sql`/* cleanupExplainStoryCapacityStories */
    DELETE FROM stories WHERE id = ANY(${fixture.storyIds}::uuid[])`)
}
