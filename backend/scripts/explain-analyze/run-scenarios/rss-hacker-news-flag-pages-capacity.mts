import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import {
  pageRssHackerNewsFlagRepair,
  pageRssHackerNewsFlags,
} from '@services/rss-feed-items/hacker-news-flag-pages'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid, seedUuidAtTimestamp } from '../seed-data/common.mts'

export async function runRssHackerNewsFlagPagesCapacity(): Promise<void> {
  // Default batch_size in queues/hacker-news-flags/config.mts.
  const limit = 100
  const matchingInterval = 80
  const now = Date.now()
  const urlId = seedUuid(30, '03')
  const otherUrlId = seedUuid(31, '03')
  const cohort = `explain-hn-rss-flags-${randomUUID()}`
  const ids = Array.from({ length: limit * matchingInterval + 1 }, (_, index) =>
    seedUuidAtTimestamp(now, 4_680_000 + index),
  )
  const after = seedUuidAtTimestamp(now, 4_679_999)
  const expected = ids.filter((_, index) => index % matchingInterval === 0)
  await write(sql`/* seedExplainRssHackerNewsFlagItems */
    WITH fixture AS (
      SELECT id, ordinal FROM unnest(${ids}::uuid[]) WITH ORDINALITY AS entry(id, ordinal)
    ), guids AS (
      INSERT INTO rss_feed_item_guids (id, url_hostname_id, guid)
      SELECT id, ${seedUuid(0, '02')}, ${cohort} || ':' || ordinal FROM fixture
      RETURNING id
    )
    INSERT INTO rss_feed_items (id, url_id, data, bedrock_nova_multimodal_v1_content_sha256)
    SELECT fixture.id,
      CASE WHEN (fixture.ordinal - 1) % ${matchingInterval} = 0 THEN ${urlId}::uuid ELSE ${otherUrlId}::uuid END,
      jsonb_build_object('title', ${cohort}::text), decode(repeat('00', 32), 'hex')
    FROM fixture JOIN guids USING (id)`)
  try {
    await write('/* analyzeExplainRssHackerNewsFlagItems */ ANALYZE rss_feed_items')
    await captureFlagPage(
      'rss-hacker-news-url-flag-page-at-cap',
      'pageHackerNewsUrlRssItems',
      cursor => pageRssHackerNewsFlags(urlId, cursor, ids.at(-1)!, limit),
      after,
      expected,
      limit,
    )
    await captureFlagPage(
      'rss-hacker-news-repair-flag-page-at-cap',
      'pageHackerNewsRssFlagRepair',
      cursor => pageRssHackerNewsFlagRepair(cursor, ids[limit]!, limit),
      after,
      ids.slice(0, limit + 1),
      limit,
    )
  } finally {
    await write(sql`/* cleanupExplainRssHackerNewsFlagItems */
      DELETE FROM rss_feed_item_guids WHERE id = ANY(${ids}::uuid[])`)
  }
}

async function captureFlagPage(
  scenario: 'rss-hacker-news-url-flag-page-at-cap' | 'rss-hacker-news-repair-flag-page-at-cap',
  queryName: string,
  readPage: (after: string) => Promise<string[]>,
  after: string,
  expected: string[],
  limit: number,
): Promise<void> {
  registerScenarioContract(scenario, {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'rss_feed_items', max: limit, captureIndex: 0 },
      { kind: 'maxProcessedRows', relation: 'rss_feed_items', max: 1, captureIndex: 1 },
    ],
  })
  await runAndCapture(
    scenario,
    async () => {
      const first = await readPage(after)
      assert.deepEqual(first, expected.slice(0, limit))
      const last = await readPage(first.at(-1)!)
      assert.deepEqual(last, expected.slice(limit))
      assert.ok(last.length < limit)
    },
    undefined,
    queryName,
  )
}
