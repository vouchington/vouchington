import assert from 'node:assert/strict'
import { read, write } from '@data-stores/psql'
import { paginationMaxima } from '@services/pagination/config'
import { getRssFeedItemEmbedsByItems } from '@services/rss-feed-items/get-rss-feed-item-embeds'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { ITEM_URL_POOL } from '../seed-data/common.mts'

type SeedEmbedItem = { id: string; url_id: string; source_url: string; title: string }

export async function runRssItemEmbedCapacityScenario(): Promise<void> {
  // The signed-in feed can hydrate three distinct previews for every primary card.
  const limit = paginationMaxima.max_limit * 4
  const half = limit / 2
  const guids = Array.from(
    { length: limit },
    (_, index) => `seed-item-guid-${index < half ? index : index - half + ITEM_URL_POOL}`,
  )
  const { rows: items } = await read<SeedEmbedItem>(sql`
    /* loadRssItemEmbedFixture */
    SELECT item.id, item.url_id, url.url AS source_url, item.data->>'title' AS title
    FROM unnest(${guids}::text[]) WITH ORDINALITY AS requested(guid, position)
    JOIN rss_feed_item_guids guid ON guid.guid = requested.guid
    JOIN rss_feed_items item ON item.id = guid.id
    JOIN urls url ON url.id = item.url_id
    WHERE item.deleted_at IS NULL
    ORDER BY requested.position
  `)
  assert.equal(items.length, limit)
  assert.equal(new Set(items.map(item => item.id)).size, limit)
  assert.equal(new Set(items.map(item => item.url_id)).size, half)
  const first = items[0]!
  const second = items[half]!
  assert.equal(first.url_id, second.url_id)
  assert.notEqual(first.title, second.title)

  const description = 'Shared URL crawl metadata'
  const { rows: crawls } = await write<{ id: string }>(sql`
    /* seedRssItemEmbedFixtureCrawl */
    INSERT INTO crawls (url_id, response_status_code, completed_at, markdown, meta_tags)
    VALUES (${first.url_id}, 200, CURRENT_TIMESTAMP, 'Administrator crawl text',
      ${JSON.stringify({ 'og:description': description })}::jsonb)
    RETURNING id
  `)
  const crawlId = crawls[0]!.id
  try {
    const expected = Object.fromEntries(items.map(item => [item.id, item.source_url]))
    registerScenarioContract('rss-item-embeds-at-feed-cap', {
      crossPartition: {
        crawls:
          'The latest successful source and embed crawls can be in different retained months.',
      },
      expectations: [],
    })
    await runAndCapture(
      'rss-item-embeds-at-feed-cap',
      async () => {
        const embeds = await getRssFeedItemEmbedsByItems(
          items.map(item => ({ id: item.id, url: { id: item.url_id } })),
        )
        assert.deepEqual(
          Object.fromEntries(
            Object.values(embeds).map(embed => [embed.rss_feed_item_id, embed.source_url]),
          ),
          expected,
        )
        for (const item of [first, second]) {
          assert.equal(embeds[item.id]?.title, item.title)
          assert.equal(embeds[item.id]?.description, description)
          assert.equal(embeds[item.id]?.markdown, null)
        }
      },
      undefined,
      'getRssFeedItemEmbedsByItems',
      { exactCapturedNames: ['getRssFeedItemEmbedsByItems'] },
    )
  } finally {
    await write(sql`/* deleteRssItemEmbedFixtureCrawl */ DELETE FROM crawls WHERE id = ${crawlId}`)
  }
}
