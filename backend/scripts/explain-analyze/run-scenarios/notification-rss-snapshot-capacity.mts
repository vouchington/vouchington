import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import { getRssFeedItemNotificationSnapshot } from '@services/notifications/reconcile-rss-feed-item-snapshot'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

export async function runNotificationRssSnapshotCapacity(): Promise<void> {
  const scenario = 'notification-rss-reconciliation-snapshot'
  const cohort = `explain-notification-snapshot-${randomUUID()}`
  const url = `https://seed-host-0.example.com/${cohort}.xml`
  const hostnameId = seedUuid(0, '02')
  const { rows: enabledFeeds } = await write<{
    id: string
  }>(sql`/* readExplainRssSnapshotVisibleFeeds */
    SELECT id FROM rss_feeds
    WHERE id = ANY(${Array.from({ length: 4 }, (_, index) => seedUuid(2200 + index, '08'))}::uuid[])
      AND is_enabled AND is_discoverable AND deleted_at IS NULL
    ORDER BY id`)
  assert.equal(enabledFeeds.length, 4)
  const {
    rows: [disabled],
  } = await write<{
    id: string
    topic_id: string
    url_id: string
  }>(sql`/* seedExplainRssSnapshotDisabledFeed */
    WITH owner AS (
      INSERT INTO topics (name, slug, created_via, bedrock_nova_multimodal_v1_content_sha256)
      VALUES (${cohort}, ${cohort}, 'system', decode(repeat('00', 32), 'hex')) RETURNING id
    ), feed_url AS (
      INSERT INTO urls (url, hostname_id, search_params)
      VALUES (${url}, ${hostnameId}, '{}'::jsonb) RETURNING id
    )
    INSERT INTO rss_feeds (rss_feed_url_id, topic_id, title, created_via)
    SELECT feed_url.id, owner.id, ${cohort}, 'system' FROM feed_url CROSS JOIN owner
    RETURNING id, topic_id, rss_feed_url_id AS url_id`)
  assert.ok(disabled)
  try {
    const { rows: items } = await write<{ id: string; guid: string }>(
      sql`/* seedExplainRssSnapshotItems */
      WITH identities AS (
        INSERT INTO rss_feed_item_guids (url_hostname_id, guid)
        SELECT ${hostnameId}, ${cohort} || '-' || state
        FROM unnest(ARRAY['visible', 'hidden', 'orphan']) input(state)
        RETURNING id, guid
      ), inserted_items AS (
        INSERT INTO rss_feed_items (id, url_id, data, bedrock_nova_multimodal_v1_content_sha256)
        SELECT id, ${disabled.url_id}, '{}'::jsonb, decode(repeat('00', 32), 'hex') FROM identities
        RETURNING id
      )
      SELECT inserted_items.id, identities.guid FROM inserted_items JOIN identities USING (id)`,
    )
    const visibleItem = items.find(item => item.guid.endsWith('-visible'))
    const hiddenItem = items.find(item => item.guid.endsWith('-hidden'))
    const orphanItem = items.find(item => item.guid.endsWith('-orphan'))
    assert.ok(visibleItem && hiddenItem && orphanItem)
    const sourceIds = [disabled.id, ...enabledFeeds.map(feed => feed.id)]
    await write(sql`/* seedExplainRssSnapshotSources */
      INSERT INTO rss_feed_item_sources (rss_feed_id, rss_feed_item_id, created_at)
      SELECT source.id, ${visibleItem.id}::uuid,
        TIMESTAMPTZ '2025-01-01' + source.ordinal * INTERVAL '1 minute'
      FROM unnest(${sourceIds}::uuid[]) WITH ORDINALITY AS source(id, ordinal)
      UNION ALL
      SELECT ${disabled.id}::uuid, ${hiddenItem.id}::uuid, TIMESTAMPTZ '2025-01-01'`)

    registerScenarioContract(scenario, {
      allowEmptyResult: true,
      expectations: [
        { kind: 'maxProcessedRows', relation: 'rss_feed_items', max: 1 },
        { kind: 'maxProcessedRows', relation: 'rss_feed_item_sources', max: sourceIds.length * 2 },
        { kind: 'maxProcessedRows', relation: 'rss_feeds', max: sourceIds.length * 2 },
      ],
    })
    await runAndCapture(
      scenario,
      async () => {
        assert.deepEqual(await getRssFeedItemNotificationSnapshot(visibleItem.id), {
          rss_feed_item_id: visibleItem.id,
          url,
          deleted_at: null,
          is_content_eligible: true,
        })
        assert.deepEqual(await getRssFeedItemNotificationSnapshot(hiddenItem.id), {
          rss_feed_item_id: hiddenItem.id,
          url,
          deleted_at: null,
          is_content_eligible: false,
        })
        assert.equal(await getRssFeedItemNotificationSnapshot(orphanItem.id), null)
      },
      undefined,
      'getRssFeedItemNotificationSnapshot',
    )
  } finally {
    await using query = await beginTransaction()
    const { rows } = await query<{ id: string }>(sql`/* cleanupExplainRssSnapshotItems */
      DELETE FROM rss_feed_item_guids WHERE url_hostname_id = ${hostnameId}
        AND guid LIKE ${`${cohort}-%`} RETURNING id`)
    await query(sql`/* cleanupExplainRssSnapshotItemIdentities */
      DELETE FROM retained_rss_feed_item_identities WHERE id = ANY(${rows.map(row => row.id)}::uuid[])`)
    await query(
      sql`/* cleanupExplainRssSnapshotFeed */ DELETE FROM rss_feeds WHERE id = ${disabled.id}`,
    )
    await query(sql`/* cleanupExplainRssSnapshotFeedIdentities */
      WITH removed_url AS (DELETE FROM urls WHERE id = ${disabled.url_id}),
        removed_topic AS (DELETE FROM topics WHERE id = ${disabled.topic_id} RETURNING id)
      DELETE FROM retained_topic_identities identity USING removed_topic
      WHERE identity.id = removed_topic.id`)
    await query.commit()
  }
}
