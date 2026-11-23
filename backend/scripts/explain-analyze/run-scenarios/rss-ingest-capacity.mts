import assert from 'node:assert/strict'
import { beginTransaction, write } from '@data-stores/psql'
import { RSS_FEED_FETCH_MAX_ITEMS } from '@services/rss-feed-items/processing-limits'
import { buildUpsertRssFeedItemsQuery } from '@services/rss-feed-items/upsert-content-query'
import { rssFeedItemsWorkMaxValues } from '@services/rss-feed-items/work-limits'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { contentHash, seedUuid } from '../seed-data/common.mts'

export async function runRssIngestCapacityScenario(): Promise<void> {
  const scenario = 'rss-ingest-content-at-cap'
  const capacity = Math.min(RSS_FEED_FETCH_MAX_ITEMS, rssFeedItemsWorkMaxValues.sql_batch_size)
  const existingCount = Math.floor(capacity / 2)
  const { identities, items } = await seedRssIngestCapacity(capacity, existingCount)
  const ids = identities.map(({ id }) => id)

  try {
    registerScenarioContract(scenario, {
      expectations: [{ kind: 'maxProcessedRows', relation: 'rss_feed_items', max: capacity }],
    })
    const identityIds = new Map(identities.map(({ guid, id }) => [guid, id]))
    const statement = buildUpsertRssFeedItemsQuery(identityIds, items, new Map())
    await runAndCapture(
      scenario,
      async () => {
        await using query = await beginTransaction()
        const { rows } = await query<{ previous_url_id: string | null }>(
          statement.text,
          statement.values,
        )
        assert.equal(rows.length, capacity)
        assert.equal(rows.filter(row => row.previous_url_id !== null).length, existingCount)
        await query.rollback()
      },
      undefined,
      'upsertRssFeedItems',
      { exactCapturedNames: ['upsertRssFeedItems'] },
    )
  } finally {
    await write(
      '/* deleteRssIngestIdentities */ DELETE FROM rss_feed_item_guids WHERE id = ANY($1::uuid[])',
      [ids],
    )
    await Promise.all([
      write(
        '/* deleteRssIngestRetainedIdentities */ DELETE FROM retained_rss_feed_item_identities WHERE id = ANY($1::uuid[])',
        [ids],
      ),
      write('/* deleteRssIngestUrls */ DELETE FROM urls WHERE id = ANY($1::uuid[])', [
        items.map(item => item.url_id),
      ]),
    ])
  }
}

async function seedRssIngestCapacity(capacity: number, existingCount: number) {
  const hostnameId = seedUuid(0, '02')
  const paths = Array.from({ length: capacity }, (_, index) => `/explain-rss-ingest/${index}`)
  await using query = await beginTransaction()
  const { rows: urls } = await query<{ id: string; url: string; pathname: string }>(
    `/* seedRssIngestUrls */
      INSERT INTO urls (hostname_id, url, pathname, search_params)
      SELECT $1::uuid, 'https://seed-host-0.example.com' || pathname, pathname, '{}'::jsonb
      FROM unnest($2::text[]) AS input(pathname)
      RETURNING id, url, pathname`,
    [hostnameId, paths],
  )
  const { rows: identities } = await query<{ id: string; guid: string }>(
    `/* seedRssIngestIdentities */
      INSERT INTO rss_feed_item_guids (url_hostname_id, guid)
      SELECT $1::uuid, guid FROM unnest($2::text[]) AS input(guid)
      ORDER BY guid
      RETURNING id, guid`,
    [hostnameId, paths],
  )
  const items = urls.map(({ id, url, pathname }) => {
    const title = `Explain RSS ingest item ${pathname}`
    return {
      feedItem: { guid: pathname, link: url, title },
      content_sha256: contentHash(title),
      url_id: id,
    }
  })
  const existing = items.slice(0, existingCount).map(item => {
    const title = `${item.feedItem.title} before refresh`
    return { ...item, feedItem: { ...item.feedItem, title }, content_sha256: contentHash(title) }
  })
  const identityIds = new Map(identities.map(({ guid, id }) => [guid, id]))
  const statement = buildUpsertRssFeedItemsQuery(identityIds, existing, new Map())
  await query(statement.text, statement.values)
  await query.commit()
  return { identities, items }
}
