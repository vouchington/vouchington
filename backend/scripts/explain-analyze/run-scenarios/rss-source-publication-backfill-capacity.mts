import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import {
  backfillRssFeedItemSourcePublications,
  hasRssFeedItemSourcesMissingPublication,
} from '@services/rss-feed-items/backfill-source-publications'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid, seedUuidAtTimestamp } from '../seed-data/common.mts'

export async function runRssSourcePublicationBackfillCapacity(): Promise<void> {
  const limit = 500 // Live default in scripts/backfill-rss-feed-item-source-publications.mts.
  const feedId = seedUuid(1740, '08')
  const unrelatedFeedId = seedUuid(1741, '08')
  const scope = { rssFeedId: feedId }
  assert.equal(await hasRssFeedItemSourcesMissingPublication(scope), false)
  const cohort = `explain-rss-source-backfill-${randomUUID()}`
  const now = Date.now()
  const existingCount = 80
  const otherCount = 2_000
  const ids = Array.from({ length: limit + 1 + existingCount + otherCount }, (_, index) =>
    seedUuidAtTimestamp(now, 5_740_000 + index),
  )
  const initialMissing = ids.slice(0, limit + 1)
  const alreadyPublished = ids.slice(limit + 1, limit + 1 + existingCount)
  const unrelated = ids.slice(limit + 1 + existingCount)
  await write(sql`/* seedExplainRssSourceBackfillItems */
    WITH guids AS (
      INSERT INTO rss_feed_item_guids (id, url_hostname_id, guid)
      SELECT id, ${seedUuid(0, '02')}, ${cohort} || ':' || ordinal
      FROM unnest(${ids}::uuid[]) WITH ORDINALITY AS fixture(id, ordinal)
      RETURNING id
    )
    INSERT INTO rss_feed_items (id, url_id, data, bedrock_nova_multimodal_v1_content_sha256)
    SELECT id, ${seedUuid(41, '03')},
      jsonb_build_object('title', ${cohort}::text, 'isoDate', '2025-01-02T03:04:05.123456Z'),
      decode(repeat('00',32), 'hex')
    FROM guids`)
  try {
    await write(sql`/* seedExplainRssSourceBackfillAssociations */
      INSERT INTO rss_feed_item_sources (rss_feed_id, rss_feed_item_id, published_at)
      SELECT ${feedId}::uuid, id, NULL::timestamptz
      FROM unnest(${initialMissing}::uuid[]) AS fixture(id)
      UNION ALL
      SELECT ${feedId}::uuid, id, TIMESTAMPTZ '2024-01-01'
      FROM unnest(${alreadyPublished}::uuid[]) AS fixture(id)
      UNION ALL
      SELECT ${unrelatedFeedId}::uuid, id, NULL::timestamptz
      FROM unnest(${unrelated}::uuid[]) AS fixture(id)`)
    await write(
      '/* analyzeExplainRssSourceBackfill */ ANALYZE rss_feed_item_sources, rss_feed_items',
    )
    const rescanSettings = {
      crossPartition: {
        rss_feed_items:
          'The publication backfill associates a feed with item IDs of different ages.',
      },
      allowEmptyResult: true,
    } as const
    const firstScenario = 'rss-source-publication-backfill-at-cap'
    registerScenarioContract(firstScenario, {
      ...rescanSettings,
      expectations: [
        { kind: 'maxProcessedRows', relation: 'rss_feed_item_sources', max: 1, captureIndex: 0 },
        {
          kind: 'maxProcessedRows',
          relation: 'rss_feed_item_sources',
          max: 2 * limit + 1,
          captureIndex: 1,
        },
        { kind: 'maxProcessedRows', relation: 'rss_feed_items', max: limit, captureIndex: 1 },
      ],
    })
    const readState = () => readFixtureState(ids)
    await runAndCapture(
      firstScenario,
      async () => {
        assert.equal(await hasRssFeedItemSourcesMissingPublication(scope), true)
        assert.equal(await backfillRssFeedItemSourcePublications(limit, scope), limit)
        assert.deepEqual(await readState(), {
          copied: initialMissing.slice(0, limit),
          unpublished: [...initialMissing.slice(limit), ...unrelated],
          preserved: alreadyPublished,
        })
      },
      undefined,
      ['hasRssFeedItemSourcesMissingPublication', 'backfillRssFeedItemSourcePublications'],
      { afterCapture: () => clearFixturePublications(feedId, initialMissing.slice(0, limit)) },
    )

    assert.equal(await backfillRssFeedItemSourcePublications(limit, scope), limit)
    const lastScenario = 'rss-source-publication-backfill-tail-at-cap'
    registerScenarioContract(lastScenario, {
      ...rescanSettings,
      expectations: [
        { kind: 'maxProcessedRows', relation: 'rss_feed_item_sources', max: 2 },
        { kind: 'maxProcessedRows', relation: 'rss_feed_items', max: 1 },
      ],
    })
    await runAndCapture(
      lastScenario,
      async () => {
        assert.equal(await backfillRssFeedItemSourcePublications(limit, scope), 1)
        assert.equal(await hasRssFeedItemSourcesMissingPublication(scope), false)
        assert.deepEqual(await readState(), {
          copied: initialMissing,
          unpublished: unrelated,
          preserved: alreadyPublished,
        })
      },
      undefined,
      'backfillRssFeedItemSourcePublications',
      { afterCapture: () => clearFixturePublications(feedId, initialMissing.slice(limit)) },
    )
  } finally {
    await write(sql`/* cleanupExplainRssSourceBackfillItems */
      DELETE FROM rss_feed_item_guids WHERE id = ANY(${ids}::uuid[])`)
  }
}

async function clearFixturePublications(feedId: string, ids: string[]): Promise<void> {
  await write(sql`/* restoreExplainRssSourceBackfillAssociations */
    UPDATE rss_feed_item_sources SET published_at = NULL
    WHERE rss_feed_id = ${feedId} AND rss_feed_item_id = ANY(${ids}::uuid[])`)
}

async function readFixtureState(ids: string[]) {
  const { rows } = await write<{
    id: string
    copied: boolean
    missing: boolean
    preserved: boolean
  }>(
    sql`/* verifyExplainRssSourceBackfillState */
      SELECT source.rss_feed_item_id AS id, source.published_at = item.published_at AS copied,
        source.published_at IS NULL AS missing,
        source.published_at = TIMESTAMPTZ '2024-01-01' AS preserved
      FROM rss_feed_item_sources source JOIN rss_feed_items item ON item.id = source.rss_feed_item_id
      WHERE source.rss_feed_item_id = ANY(${ids}::uuid[]) ORDER BY source.rss_feed_item_id`,
  )
  return {
    copied: rows.flatMap(row => (row.copied ? [row.id] : [])),
    unpublished: rows.flatMap(row => (row.missing ? [row.id] : [])),
    preserved: rows.flatMap(row => (row.preserved ? [row.id] : [])),
  }
}
