import { beginTransaction } from '@data-stores/psql'
import { postSeedTimestampMs, seedUuid, seedUuidAtTimestamp } from './common.mts'

const HIDDEN_STORY_COUNT = 200
const VISIBLE_STORY_COUNT = 40
const STORY_COUNT = HIDDEN_STORY_COUNT + VISIBLE_STORY_COUNT

/**
 * Newest and highest-scored story posts whose only source is a hidden feed, then a
 * smaller visible set behind them. stories and story_posts stay out of ANALYZE.
 */
export async function seedHiddenFeedStorySearch(initiatedById: string): Promise<void> {
  const hostnameId = seedUuid(0, 'b7')
  const disabledTopicId = seedUuid(0, 'b8')
  const quietTopicId = seedUuid(1, 'b8')
  const disabledUrlId = seedUuid(0, 'b9')
  const quietUrlId = seedUuid(1, 'b9')
  const disabledFeedId = seedUuid(0, 'ba')
  const quietFeedId = seedUuid(1, 'ba')
  const visibleFeedId = seedUuid(0, '08')
  const visibleHostnameId = seedUuid(0, '02')
  const visibleUrlId = seedUuid(0, '03')
  const anchorMs = postSeedTimestampMs(0)
  const postIds: string[] = []
  const itemIds: string[] = []
  const storyIds: string[] = []
  const titles: string[] = []
  const votes: number[] = []
  const feedIds: string[] = []
  const itemHostnameIds: string[] = []
  const itemUrlIds: string[] = []
  for (let index = 0; index < STORY_COUNT; index += 1) {
    const hidden = index < HIDDEN_STORY_COUNT
    postIds.push(seedUuidAtTimestamp(anchorMs + (STORY_COUNT - index) * 60_000, 910_000 + index))
    // Current ids stay after the fixture's oldest rss item, which the rate-limit seed reads.
    itemIds.push(seedUuidAtTimestamp(Date.now(), 930_000 + index))
    storyIds.push(seedUuid(index, 'bc'))
    titles.push(hidden ? 'Hidden feed story' : 'Visible feed story')
    votes.push(hidden ? 400 : 40)
    feedIds.push(hidden ? (index % 2 === 0 ? disabledFeedId : quietFeedId) : visibleFeedId)
    itemHostnameIds.push(hidden ? hostnameId : visibleHostnameId)
    itemUrlIds.push(hidden ? (index % 2 === 0 ? disabledUrlId : quietUrlId) : visibleUrlId)
  }
  await using transaction = await beginTransaction()
  const query = transaction
  await query(
    `/* seedHiddenFeedStorySearch:feeds */ INSERT INTO url_hostnames (id, hostname)
     VALUES ($1, 'story-search-hidden.example')
     ON CONFLICT DO NOTHING`,
    [hostnameId],
  )
  await query(
    `/* seedHiddenFeedStorySearch:topics */ INSERT INTO topics (
       id, name, slug, created_via, bedrock_nova_multimodal_v1_content_sha256)
     VALUES
       ($1, 'Hidden disabled feed', 'story-search-hidden-disabled', 'system', decode(repeat('ab', 32), 'hex')),
       ($2, 'Hidden quiet feed', 'story-search-hidden-quiet', 'system', decode(repeat('ab', 32), 'hex'))
     ON CONFLICT DO NOTHING`,
    [disabledTopicId, quietTopicId],
  )
  await query(
    `/* seedHiddenFeedStorySearch:urls */ INSERT INTO urls (id, url, hostname_id, search_params)
     VALUES
       ($1, 'https://story-search-hidden.example/disabled.xml', $3, '{}'::jsonb),
       ($2, 'https://story-search-hidden.example/quiet.xml', $3, '{}'::jsonb)
     ON CONFLICT DO NOTHING`,
    [disabledUrlId, quietUrlId, hostnameId],
  )
  await query(
    `/* seedHiddenFeedStorySearch:rss */ INSERT INTO rss_feeds (
       id, rss_feed_url_id, topic_id, title, created_via)
     VALUES
       ($1, $2, $3, 'Disabled story feed', 'system'),
       ($4, $5, $6, 'Quiet story feed', 'system')
     ON CONFLICT DO NOTHING`,
    [disabledFeedId, disabledUrlId, disabledTopicId, quietFeedId, quietUrlId, quietTopicId],
  )
  await query(
    `/* seedHiddenFeedStorySearch:settings */ INSERT INTO rss_feed_setting_changes (
       change_type, rss_feed_id, is_enabled, reason)
     VALUES
       ('enablement', $1, FALSE, 'story search hidden feed'),
       ('discoverability', $1, TRUE, 'story search hidden feed'),
       ('enablement', $2, TRUE, 'story search hidden feed'),
       ('discoverability', $2, FALSE, 'story search hidden feed')`,
    [disabledFeedId, quietFeedId],
  )
  await query(
    `/* seedHiddenFeedStorySearch:stories */ INSERT INTO stories (id, title)
     SELECT id, 'Story search seed' FROM UNNEST($1::uuid[]) AS seed(id)
     ON CONFLICT DO NOTHING`,
    [storyIds],
  )
  await query(
    `/* seedHiddenFeedStorySearch:guids */ INSERT INTO rss_feed_item_guids (id, url_hostname_id, guid)
     SELECT id, hostname_id, 'story-search-' || id::text
     FROM UNNEST($1::uuid[], $2::uuid[]) AS seed(id, hostname_id)
     ON CONFLICT DO NOTHING`,
    [itemIds, itemHostnameIds],
  )
  await query(
    `/* seedHiddenFeedStorySearch:items */ INSERT INTO rss_feed_items (
       id, url_id, data, story_id, bedrock_nova_multimodal_v1_content_sha256)
     SELECT id, url_id, '{"title":"Story search seed"}'::jsonb, story_id, decode(repeat('ab', 32), 'hex')
     FROM UNNEST($1::uuid[], $2::uuid[], $3::uuid[]) AS seed(id, url_id, story_id)
     ON CONFLICT DO NOTHING`,
    [itemIds, itemUrlIds, storyIds],
  )
  await query(
    `/* seedHiddenFeedStorySearch:sources */ INSERT INTO rss_feed_item_sources (
       rss_feed_id, rss_feed_item_id, published_at)
     SELECT feed_id, item_id, '2020-01-01T00:00:00Z'
     FROM UNNEST($1::uuid[], $2::uuid[]) AS seed(feed_id, item_id)
     ON CONFLICT DO NOTHING`,
    [feedIds, itemIds],
  )
  await query(
    `/* seedHiddenFeedStorySearch:posts */ INSERT INTO posts (
       id, created_via, post_type, title, created_by_id, approved_at, votes_score_up,
       bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256)
     SELECT id, 'system', 'story', title, $2, CURRENT_TIMESTAMP, votes,
       decode(repeat('ab', 32), 'hex'), decode(repeat('ab', 32), 'hex')
     FROM UNNEST($1::uuid[], $3::text[], $4::float8[]) AS seed(id, title, votes)
     ON CONFLICT DO NOTHING`,
    [postIds, initiatedById, titles, votes],
  )
  await query(
    `/* seedHiddenFeedStorySearch:links */ INSERT INTO story_posts (post_id, story_id, initiated_by_id)
     SELECT post_id, story_id, $3
     FROM UNNEST($1::uuid[], $2::uuid[]) AS seed(post_id, story_id)
     ON CONFLICT DO NOTHING`,
    [postIds, storyIds, initiatedById],
  )
  const counted = await query<{ hidden: string; visible: string }>(
    `/* seedHiddenFeedStorySearch:count */ SELECT
       COUNT(*) FILTER (
         WHERE posts.title = 'Hidden feed story' AND NOT (feed.is_enabled AND feed.is_discoverable)
       )::text AS hidden,
       COUNT(*) FILTER (
         WHERE posts.title = 'Visible feed story' AND feed.is_enabled AND feed.is_discoverable
       )::text AS visible
     FROM posts
     JOIN story_posts ON story_posts.post_id = posts.id
     JOIN rss_feed_items item ON item.story_id = story_posts.story_id AND item.deleted_at IS NULL
     JOIN rss_feed_item_sources src ON src.rss_feed_item_id = item.id
     JOIN rss_feeds feed ON feed.id = src.rss_feed_id AND feed.deleted_at IS NULL
     WHERE posts.id = ANY($1::uuid[])`,
    [postIds],
  )
  const hidden = Number(counted.rows[0]?.hidden ?? 0)
  const visible = Number(counted.rows[0]?.visible ?? 0)
  if (hidden !== HIDDEN_STORY_COUNT || visible !== VISIBLE_STORY_COUNT) {
    throw new Error(
      `story search seed expected ${HIDDEN_STORY_COUNT} hidden and ${VISIBLE_STORY_COUNT} visible stories, found ${hidden} and ${visible}`,
    )
  }
  await transaction.commit()
}
