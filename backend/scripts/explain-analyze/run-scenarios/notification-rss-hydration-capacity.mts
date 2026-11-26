import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import { listNotifications } from '@services/notifications/list'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

const PAGE_SIZE = 100 // The signed-in inbox ceiling in services/notifications/list.mts.

export async function runNotificationRssHydrationCapacity(): Promise<void> {
  const scenario = 'notification-rss-hydration-at-cap'
  const cohort = `explain-notification-rss-${randomUUID()}`
  const guids = Array.from({ length: PAGE_SIZE }, (_, index) => `seed-item-guid-${12_000 + index}`)
  const { rows: visible } = await write<{ id: string }>(sql`/* readExplainNotificationRssItems */
    SELECT id FROM rss_feed_item_guids WHERE guid = ANY(${guids}::text[]) ORDER BY id`)
  assert.equal(visible.length, PAGE_SIZE)

  const {
    rows: [recipient],
  } = await write<{ id: string }>(sql`/* seedExplainNotificationRssRecipient */
    INSERT INTO users (username) VALUES (${cohort}) RETURNING id`)
  assert.ok(recipient)
  try {
    const {
      rows: [orphan],
    } = await write<{ id: string }>(sql`/* seedExplainNotificationRssItemWithoutSource */
      WITH owned_guid AS (
        INSERT INTO rss_feed_item_guids (url_hostname_id, guid)
        VALUES (${seedUuid(0, '02')}, ${cohort}) RETURNING id
      )
      INSERT INTO rss_feed_items (id, url_id, data, bedrock_nova_multimodal_v1_content_sha256)
      SELECT id, ${seedUuid(40, '03')}, jsonb_build_object('title', 'Detached feed item'),
        decode(repeat('00', 32), 'hex')
      FROM owned_guid RETURNING id`)
    assert.ok(orphan)
    const itemIds = [...visible.map(item => item.id), orphan.id]
    const { rows: notifications } = await write<{ id: string; rss_feed_item_id: string }>(
      sql`/* seedExplainNotificationRssInbox */
        INSERT INTO notifications (user_id, entity_type, kind, rss_feed_item_id, target_path)
        SELECT ${recipient.id}, 'rss_feed_item', 'rss_item_new', item.id, '/rss'
        FROM unnest(${itemIds}::uuid[]) WITH ORDINALITY AS item(id, ordinal)
        ORDER BY item.ordinal
        RETURNING id, rss_feed_item_id`,
    )
    const expected = notifications.toSorted((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
    const {
      rows: [corpus],
    } = await write<{
      feeds: number
      items: number
      sources: number
      urls: number
    }>(sql`/* countExplainNotificationRssCorpus */
      SELECT (SELECT count(*)::int FROM rss_feeds) AS feeds,
        (SELECT count(*)::int FROM rss_feed_items) AS items,
        (SELECT count(*)::int FROM rss_feed_item_sources) AS sources,
        (SELECT count(*)::int FROM urls) AS urls`)
    assert.ok(corpus)
    registerScenarioContract(scenario, {
      crossPartition: { rss_feed_items: 'Notification references can span item UUID partitions.' },
      seededRows: {
        rss_feeds: corpus.feeds,
        rss_feed_items: corpus.items,
        rss_feed_item_sources: corpus.sources,
        urls: corpus.urls,
      },
      expectations: [
        { kind: 'maxProcessedRows', relation: 'rss_feed_items', max: PAGE_SIZE, captureIndex: 0 },
        { kind: 'maxProcessedRows', relation: 'rss_feed_items', max: 1, captureIndex: 1 },
        {
          kind: 'maxProcessedRows',
          relation: 'rss_feed_item_sources',
          max: PAGE_SIZE * 4,
          captureIndex: 0,
        },
        { kind: 'maxProcessedRows', relation: 'rss_feed_item_sources', max: 4, captureIndex: 1 },
      ],
    })
    await runAndCapture(
      scenario,
      async () => {
        const first = await listNotifications(recipient.id, { limit: PAGE_SIZE })
        const expectedFirst = expected.slice(0, PAGE_SIZE)
        assert.deepEqual(
          first.results.map(item => item.id),
          expectedFirst.map(item => item.id),
        )
        assert.deepEqual(
          Object.keys(first.rss_feed_items).toSorted(),
          expectedFirst
            .flatMap(item => (item.rss_feed_item_id === orphan.id ? [] : [item.rss_feed_item_id]))
            .toSorted(),
        )
        assert.equal(first.page_info.has_next_page, true)
        assert.ok(first.page_info.end_cursor)
        const tail = await listNotifications(recipient.id, {
          limit: PAGE_SIZE,
          after: first.page_info.end_cursor,
        })
        assert.deepEqual(
          tail.results.map(item => item.id),
          expected.slice(PAGE_SIZE).map(item => item.id),
        )
        assert.deepEqual(
          Object.keys(tail.rss_feed_items),
          expected
            .slice(PAGE_SIZE)
            .flatMap(item => (item.rss_feed_item_id === orphan.id ? [] : [item.rss_feed_item_id])),
        )
        assert.equal(tail.page_info.has_next_page, false)
        assert.equal(tail.page_info.end_cursor, null)
      },
      undefined,
      'hydrateNotificationRssFeedItems',
    )
  } finally {
    await write(
      sql`/* cleanupExplainNotificationRssRecipient */ DELETE FROM users WHERE id = ${recipient.id}`,
    )
    await write(
      sql`/* cleanupExplainNotificationRssItem */ DELETE FROM rss_feed_item_guids
      WHERE url_hostname_id = ${seedUuid(0, '02')} AND guid = ${cohort}`,
    )
  }
}
