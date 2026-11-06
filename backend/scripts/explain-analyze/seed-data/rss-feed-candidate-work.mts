import { beginTransaction } from '@data-stores/psql'
import { contentHash, seedUuid, seedUuidAtTimestamp } from './common.mts'

const AT_CAP_TOPIC_START = 9_968
const AT_CAP_TOPIC_COUNT = 32
const AT_CAP_ITEMS_PER_TOPIC = 33
const MAINTENANCE_CHILD_COUNT = 120
const MAINTENANCE_ITEM_GUID = 'rss-candidate-maintenance-fanout-item'
const AT_CAP_STORY_ITEM_COUNT = 9

export const RSS_AT_CAP_STORY_ID = seedUuid(17, '17')
export const RSS_AT_CAP_STORY_TOKEN = 'rsscandidatecapstory'

/** Fill every selected topic's per-source item page and enqueue one multi-page repair item. */
export async function seedRssFeedCandidateWork(): Promise<void> {
  await using transaction = await beginTransaction()
  const now = Date.now()
  const atCapRows = Array.from(
    { length: AT_CAP_TOPIC_COUNT * AT_CAP_ITEMS_PER_TOPIC },
    (_, index) => {
      const topicIndex = AT_CAP_TOPIC_START + Math.floor(index / AT_CAP_ITEMS_PER_TOPIC)
      const isoDate = new Date(now - 5000).toISOString()
      return {
        id: seedUuidAtTimestamp(now - 1000, 10_000_000 + index),
        hostname_id: seedUuid(0, '02'),
        guid: `rss-candidate-at-cap-item-${index}`,
        url_id: seedUuid(2500, '03'),
        data: {
          title: `RSS candidate at-cap item ${index}${
            index >= AT_CAP_TOPIC_COUNT * AT_CAP_ITEMS_PER_TOPIC - AT_CAP_STORY_ITEM_COUNT
              ? ` ${RSS_AT_CAP_STORY_TOKEN}`
              : ''
          }`,
          link: `https://example.com/rss-candidate-at-cap/${index}`,
          isoDate,
        },
        topic_id: seedUuid(topicIndex, '04'),
        rss_feed_id: seedUuid(0, '08'),
      }
    },
  )
  const maintenanceIsoDate = new Date(now - 380 * 24 * 60 * 60_000).toISOString()
  const maintenanceRepairIsoDate = new Date(now - 30 * 24 * 60 * 60_000).toISOString()
  const maintenanceRow = {
    id: seedUuidAtTimestamp(now - 60_000, 11_100_000),
    hostname_id: seedUuid(0, '02'),
    guid: MAINTENANCE_ITEM_GUID,
    url_id: seedUuid(2500, '03'),
    data: {
      title: 'RSS candidate reconciliation fanout item',
      link: 'https://example.com/rss-candidate-maintenance/fanout',
      isoDate: maintenanceIsoDate,
    },
    topic_id: null,
    rss_feed_id: null,
  }
  const allRows = [...atCapRows, maintenanceRow]
  const rowsJson = JSON.stringify(allRows)
  await transaction(
    `/* seedRssFeedCandidateWorkIdentities */
     INSERT INTO rss_feed_item_guids (id, url_hostname_id, guid)
     SELECT seeded.id, seeded.hostname_id, seeded.guid
     FROM jsonb_to_recordset($1::jsonb) AS seeded(id uuid, hostname_id uuid, guid text)
     ON CONFLICT (url_hostname_id, guid) DO NOTHING`,
    [rowsJson],
  )
  await transaction(
    `/* seedRssFeedCandidateWorkItems */
     INSERT INTO rss_feed_items
       (id, url_id, data, bedrock_nova_multimodal_v1_content_sha256)
     SELECT identity.id, seeded.url_id, seeded.data, $2::bytea
     FROM jsonb_to_recordset($1::jsonb) AS seeded(
       hostname_id uuid, guid text, url_id uuid, data jsonb,
       topic_id uuid, rss_feed_id uuid
     )
     JOIN rss_feed_item_guids identity
       ON identity.url_hostname_id = seeded.hostname_id AND identity.guid = seeded.guid
     ON CONFLICT (id) DO NOTHING`,
    [rowsJson, contentHash('rss-feed-candidate-work-fixture')],
  )
  const officialStoryGuid = atCapRows.at(-1)!.guid
  await transaction(
    `/* seedRssFeedCandidateWorkStory */
     INSERT INTO stories (id, title, official_rss_feed_item_id)
     SELECT $1::uuid, 'RSS candidate at-cap semantic story', id
     FROM rss_feed_item_guids WHERE guid = $2::text
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       official_rss_feed_item_id = EXCLUDED.official_rss_feed_item_id,
       deleted_at = NULL`,
    [RSS_AT_CAP_STORY_ID, officialStoryGuid],
  )
  const storyGuids = atCapRows.slice(-AT_CAP_STORY_ITEM_COUNT).map(row => row.guid)
  await transaction(
    `/* seedRssFeedCandidateWorkStoryItems */
     UPDATE rss_feed_items
     SET story_id = $1::uuid, votes_score_up = 1
     WHERE id IN (
       SELECT id FROM rss_feed_item_guids WHERE guid = ANY($2::text[])
     )`,
    [RSS_AT_CAP_STORY_ID, storyGuids],
  )
  await transaction(
    `/* seedRssFeedCandidateWorkSources */
     INSERT INTO rss_feed_item_sources (rss_feed_id, rss_feed_item_id, published_at)
     SELECT seeded.rss_feed_id, item.id, item.published_at
     FROM jsonb_to_recordset($1::jsonb) AS seeded(
       hostname_id uuid, guid text, url_id uuid, data jsonb,
       topic_id uuid, rss_feed_id uuid
     )
     JOIN rss_feed_item_guids identity
       ON identity.url_hostname_id = seeded.hostname_id AND identity.guid = seeded.guid
     JOIN rss_feed_items item ON item.id = identity.id
     WHERE seeded.rss_feed_id IS NOT NULL
     ON CONFLICT DO NOTHING`,
    [rowsJson],
  )
  const topicRows = [
    ...atCapRows.map(row => ({ guid: row.guid, topic_id: row.topic_id })),
    ...Array.from({ length: MAINTENANCE_CHILD_COUNT }, (_, index) => ({
      guid: MAINTENANCE_ITEM_GUID,
      topic_id: seedUuid(index, '04'),
    })),
  ]
  await transaction(
    `/* seedRssFeedCandidateWorkTopics */
     INSERT INTO relation__rss_feed_item__category__topic
       (subject_id, object_id, created_by_id, votes_score_up)
     SELECT identity.id, seeded.topic_id, $2::uuid, 1
     FROM jsonb_to_recordset($1::jsonb) AS seeded(guid text, topic_id uuid)
     JOIN rss_feed_item_guids identity ON identity.guid = seeded.guid
     ON CONFLICT (subject_id, object_id) DO NOTHING`,
    [JSON.stringify(topicRows), seedUuid(0, '01')],
  )
  await transaction(
    `/* seedRssFeedCandidateWorkBacklog */
     INSERT INTO rss_feed_item_candidate_reconciliations (rss_feed_item_id)
     SELECT id FROM rss_feed_item_guids
     WHERE guid LIKE 'rss-candidate-at-cap-item-%'
     ON CONFLICT (rss_feed_item_id) DO NOTHING`,
  )
  const maintenanceSources = Array.from({ length: MAINTENANCE_CHILD_COUNT }, (_, index) => ({
    feed_id: seedUuid(index, '08'),
  }))
  await transaction(
    `/* seedRssFeedCandidateMaintenanceSources */
     INSERT INTO rss_feed_item_sources (rss_feed_id, rss_feed_item_id, published_at)
     SELECT seeded.feed_id, item.id, item.published_at
     FROM jsonb_to_recordset($1::jsonb) AS seeded(feed_id uuid)
     JOIN rss_feeds feed ON feed.id = seeded.feed_id
     JOIN rss_feed_item_guids identity ON identity.guid = $2::text
     JOIN rss_feed_items item ON item.id = identity.id
     ON CONFLICT DO NOTHING`,
    [JSON.stringify(maintenanceSources), MAINTENANCE_ITEM_GUID],
  )
  await transaction(
    `/* seedRssFeedCandidateMaintenanceDate */
     UPDATE rss_feed_items
     SET data = jsonb_set(data, '{isoDate}', to_jsonb($2::text))
     WHERE id = (SELECT id FROM rss_feed_item_guids WHERE guid = $1::text LIMIT 1)`,
    [MAINTENANCE_ITEM_GUID, maintenanceRepairIsoDate],
  )
  await transaction.commit()
}
