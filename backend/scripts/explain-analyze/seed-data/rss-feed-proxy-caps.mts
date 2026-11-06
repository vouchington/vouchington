import { beginTransaction } from '@data-stores/psql'
import { contentHash, seedUuid, seedUuidAtTimestamp } from './common.mts'

export const RSS_PROXY_CAP_USER_ID = seedUuid(30_000_000, '01')
const COMMUNITY_COUNT = 16
const LIST_COUNT = 32

/** Give every capped proxy list a distinct feed and topic with a live item head. */
export async function seedRssFeedProxyCaps(): Promise<void> {
  const now = Date.now()
  const communities = Array.from({ length: COMMUNITY_COUNT }, (_, index) => ({
    id: seedUuid(30_000_000 + index, '22'),
    name: `Explain RSS proxy ${index}`,
    slug: `explain-rss-proxy-cap-${index}`,
  }))
  const items = Array.from({ length: COMMUNITY_COUNT * LIST_COUNT }, (_, index) => ({
    id: seedUuidAtTimestamp(now - 1000, 30_000_000 + index),
    community_id: communities[Math.floor(index / LIST_COUNT)]!.id,
    feed_id: seedUuid(index, '08'),
    topic_id: seedUuid(index, '04'),
    guid: `explain-rss-proxy-cap-${index}`,
    data: {
      title: `Explain RSS proxy cap ${index}`,
      link: `https://example.com/explain-rss-proxy-cap/${index}`,
      isoDate: new Date(now - 2 * 24 * 60 * 60_000 - (index + 1) * 1000).toISOString(),
    },
  }))
  const communityJson = JSON.stringify(communities)
  const itemJson = JSON.stringify(items)
  await using transaction = await beginTransaction()
  await transaction(
    `/* seedRssProxyUser */ INSERT INTO users (id, username)
     VALUES ($1::uuid, 'explain-rss-proxy-cap') ON CONFLICT DO NOTHING`,
    [RSS_PROXY_CAP_USER_ID],
  )
  await transaction(
    `/* seedRssProxyCommunities */ INSERT INTO communities (id, name, slug, created_by_id, created_via)
     SELECT id, name, slug, $2::uuid, 'system'
     FROM jsonb_to_recordset($1::jsonb) AS c(id uuid, name text, slug text)
     ON CONFLICT DO NOTHING`,
    [communityJson, RSS_PROXY_CAP_USER_ID],
  )
  await transaction(
    `/* seedRssProxyFollows */ INSERT INTO relation__user__proxy_follow__community (subject_id, object_id)
     SELECT $2::uuid, id FROM jsonb_to_recordset($1::jsonb) AS c(id uuid)
     ON CONFLICT DO NOTHING`,
    [communityJson, RSS_PROXY_CAP_USER_ID],
  )
  for (const [table, column, field] of [
    ['community_list_rss_feeds', 'rss_feed_id', 'feed_id'],
    ['community_list_topics', 'topic_id', 'topic_id'],
  ] as const) {
    // no-mistakes-disable-next-line query-reached-per-item: exactly two bounded list tables are seeded.
    await transaction(
      `/* seedRssProxyLists */ INSERT INTO ${table} (community_id, ${column}, added_by_id)
       SELECT community_id, ${field}, $2::uuid
       FROM jsonb_to_recordset($1::jsonb) AS i(community_id uuid, feed_id uuid, topic_id uuid)
       ON CONFLICT DO NOTHING`,
      [itemJson, RSS_PROXY_CAP_USER_ID],
    )
  }
  await transaction(
    `/* seedRssProxyGuids */ INSERT INTO rss_feed_item_guids (id, url_hostname_id, guid)
     SELECT id, $2::uuid, guid FROM jsonb_to_recordset($1::jsonb) AS i(id uuid, guid text)
     ON CONFLICT DO NOTHING`,
    [itemJson, seedUuid(0, '02')],
  )
  await transaction(
    `/* seedRssProxyItems */ INSERT INTO rss_feed_items (id, url_id, data, bedrock_nova_multimodal_v1_content_sha256)
     SELECT id, $2::uuid, data, $3::bytea
     FROM jsonb_to_recordset($1::jsonb) AS i(id uuid, data jsonb)
     ON CONFLICT DO NOTHING`,
    [itemJson, seedUuid(2500, '03'), contentHash('explain-rss-proxy-cap')],
  )
  await transaction(
    `/* seedRssProxySources */ INSERT INTO rss_feed_item_sources (rss_feed_id, rss_feed_item_id, published_at)
     SELECT i.feed_id, item.id, item.published_at
     FROM jsonb_to_recordset($1::jsonb) AS i(id uuid, feed_id uuid)
     JOIN rss_feed_items item ON item.id = i.id ON CONFLICT DO NOTHING`,
    [itemJson],
  )
  await transaction(
    `/* seedRssProxyTopics */ INSERT INTO relation__rss_feed_item__category__topic
       (subject_id, object_id, created_by_id, votes_score_up)
     SELECT id, topic_id, $2::uuid, 1
     FROM jsonb_to_recordset($1::jsonb) AS i(id uuid, topic_id uuid)
     ON CONFLICT DO NOTHING`,
    [itemJson, RSS_PROXY_CAP_USER_ID],
  )
  await transaction.commit()
}
