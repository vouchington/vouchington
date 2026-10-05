import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { insertTestStory } from './stories.mts'
import { insertTestRssFeedDirect } from './rss-feeds.mts'
import { getTestRssFeedUrlHostnameId } from './rss-feed-items.mts'
import { createTestUrlWithHostname } from './urls.mts'

export async function createTestStoryMembers(
  count: number,
  options: { urlId?: string; topicId?: string } = {},
) {
  const story = await insertTestStory({ title: 'Bounded story members' })
  const feed = await insertTestRssFeedDirect({ topicId: options.topicId })
  const urlId = options.urlId ?? (await createTestUrlWithHostname())
  const hostnameId = await getTestRssFeedUrlHostnameId(feed.id)
  const { rows } = await write<{ id: string }>(sql`/* createTestStoryMembers */
    WITH generated AS MATERIALIZED (
      SELECT uuidv7() AS id, 'story-page-' || uuidv7()::text AS guid
      FROM generate_series(1, ${count})
    ), identities AS (
      INSERT INTO rss_feed_item_guids (id, url_hostname_id, guid)
      SELECT id, ${hostnameId}, guid FROM generated RETURNING id
    ), items AS (
      INSERT INTO rss_feed_items (
        id, url_id, story_id, data, bedrock_nova_multimodal_v1_content_sha256
      )
      SELECT id, ${urlId}, ${story.id}, '{"title":"Story member","description":"<p>Related article.</p>"}'::jsonb,
        decode(repeat('00', 32), 'hex') FROM identities
      RETURNING id, published_at
    )
    INSERT INTO rss_feed_item_sources (rss_feed_id, rss_feed_item_id, published_at)
    SELECT ${feed.id}, id, published_at FROM items
    RETURNING rss_feed_item_id AS id
  `)
  return {
    story,
    feed,
    urlId,
    itemIds: rows
      .map(row => row.id)
      .toSorted()
      .reverse(),
  }
}

export async function setTestStoryMemberSourceState(feedId: string, state: 'disabled' | 'deleted') {
  if (state === 'deleted') {
    await write(
      sql`/* setTestStoryMemberSourceState */ UPDATE rss_feeds SET deleted_at = CURRENT_TIMESTAMP WHERE id = ${feedId}`,
    )
    return
  }
  await write(sql`/* setTestStoryMemberSourceState */
    INSERT INTO rss_feed_setting_changes (change_type, rss_feed_id, is_enabled, reason)
    VALUES ('enablement', ${feedId}, FALSE, 'story visibility test')
  `)
}

export async function insertTestStoryMemberTopic(itemId: string, topicId: string, score: number) {
  await write(sql`/* insertTestStoryMemberTopic */
    INSERT INTO relation__rss_feed_item__category__topic (subject_id, object_id, votes_score_up)
    VALUES (${itemId}, ${topicId}, ${score})
  `)
}

export async function setTestStoryMemberTitle(itemId: string, title: string) {
  await write(sql`/* setTestStoryMemberTitle */
    UPDATE rss_feed_items SET data = jsonb_set(data, '{title}', to_jsonb(${title}::text)) WHERE id = ${itemId}
  `)
}
