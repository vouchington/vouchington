import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import { cleanupHackerNewsReferences } from '@services/data-retention/cleanup-hacker-news'
import {
  getHackerNewsWorkLimit,
  hackerNewsWorkConfig,
} from '@services/urls/hacker-news-work-limits'
import {
  overrideDynamicConfigFieldsForTest,
  pinDynamicConfigFields,
} from '@voucha/test-helpers/dynamic-config'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

const recentUrls = 8_000
const now = new Date('1900-01-02T00:00:00Z')
const queryNames = [
  'deleteExpiredHackerNewsStories',
  'deleteExpiredHackerNewsComments',
  'deleteExpiredHackerNewsTotals',
]

export async function runHackerNewsRetentionDeleteCapacityScenario(): Promise<void> {
  const scenario = 'hacker-news-retention-deletes-at-cap'
  await hackerNewsWorkConfig.waitForInitialization()
  const batchSize = getHackerNewsWorkLimit('retention_batch_size')
  const fixture = await seedFixture(batchSize)
  const restore = overrideDynamicConfigFieldsForTest(hackerNewsWorkConfig, {
    retention_max_batches: 1,
  })
  try {
    await write(`/* analyzeHackerNewsRetentionDeleteCapacity */
      ANALYZE url_hacker_news_totals, url_hacker_news_stories, url_hacker_news_comments`)
    registerScenarioContract(scenario, {
      allowEmptyResult: true,
      expectations: [
        // Read each selected story once for the candidate page and once for deletion.
        {
          kind: 'maxProcessedRows',
          relation: 'url_hacker_news_stories',
          max: batchSize * 12 * 2,
        },
        // Read each selected comment once for the candidate page and once for deletion.
        {
          kind: 'maxProcessedRows',
          relation: 'url_hacker_news_comments',
          max: batchSize * 18 * 2,
        },
        { kind: 'maxProcessedRows', relation: 'url_hacker_news_totals', max: batchSize },
      ],
      seededRows: fixture.seededRows,
    })
    await runAndCapture(
      scenario,
      async () => {
        await using query = await beginTransaction()
        // A Valkey refresh replaces the shared field map between awaits and resets the pinned
        // retention_max_batches to its default of 20, which lets one run delete all 501 expired
        // rows. Pin it again in the same turn as the measured call.
        pinDynamicConfigFields(hackerNewsWorkConfig, { retention_max_batches: 1 })
        const result = await cleanupHackerNewsReferences({ query, now })
        assert.deepEqual(result, { deleted: batchSize, hasMore: true })
        const { rows } = await query<{
          url_id: string
          stories: number
          comments: number
        }>(sql`
          /* inspectHackerNewsRetentionDeleteCapacity */
          SELECT input.url_id, stories.n AS stories, comments.n AS comments
          FROM unnest(${fixture.urlIds}::uuid[]) WITH ORDINALITY AS input(url_id, ordinal)
          JOIN url_hacker_news_totals total USING (url_id)
          CROSS JOIN LATERAL (
            SELECT count(*)::int AS n FROM url_hacker_news_stories s WHERE s.url_id = input.url_id
          ) AS stories
          CROSS JOIN LATERAL (
            SELECT count(*)::int AS n FROM url_hacker_news_comments c WHERE c.url_id = input.url_id
          ) AS comments
          ORDER BY input.ordinal
        `)
        assert.deepEqual(
          rows,
          fixture.urlIds.slice(batchSize).map((id, i) => ({
            url_id: id,
            stories: i === 0 ? 12 : 3,
            comments: i === 0 ? 18 : 4,
          })),
        )
        const {
          rows: [removed],
        } = await query<{
          stories: number
          comments: number
          urls: number
        }>(sql`
          /* inspectHackerNewsRetentionDeletedChildren */
          SELECT
            (SELECT count(*)::int FROM url_hacker_news_stories WHERE url_id = ANY(${fixture.urlIds.slice(0, batchSize)}::uuid[])) AS stories,
            (SELECT count(*)::int FROM url_hacker_news_comments WHERE url_id = ANY(${fixture.urlIds.slice(0, batchSize)}::uuid[])) AS comments,
            (SELECT count(*)::int FROM urls WHERE id = ANY(${fixture.urlIds.slice(0, batchSize)}::uuid[])) AS urls
        `)
        assert.deepEqual(removed, { stories: 0, comments: 0, urls: batchSize })
        await query.rollback()
      },
      undefined,
      queryNames,
    )
  } finally {
    restore()
    await fixture.cleanup()
  }
}

async function seedFixture(batchSize: number) {
  const host = `hn-retention-capacity-${randomUUID()}.example.invalid`
  const expiredWithNext = batchSize + 1
  await using query = await beginTransaction()
  const {
    rows: [hostname],
  } = await query<{ id: string }>(sql`
    /* seedHackerNewsRetentionDeleteCapacity:hostname */
    INSERT INTO url_hostnames (hostname) VALUES (${host}) RETURNING id
  `)
  const hostnameId = hostname!.id
  const { rows: urls } = await query<{ id: string; url: string }>(sql`
    /* seedHackerNewsRetentionDeleteCapacity:urls */
    INSERT INTO urls (hostname_id, url, search_params)
    SELECT ${hostnameId}, 'https://' || ${host}::text || '/' || n, '{}'::jsonb
    FROM generate_series(1, ${expiredWithNext + recentUrls}::int) AS fixture(n)
    RETURNING id, url
  `)
  const urlIds = urls
    .toSorted(
      (a, b) =>
        Number(a.url.slice(a.url.lastIndexOf('/') + 1)) -
        Number(b.url.slice(b.url.lastIndexOf('/') + 1)),
    )
    .map(row => row.id)
  await query(sql`
    /* seedHackerNewsRetentionDeleteCapacity:totals */
    INSERT INTO url_hacker_news_totals (url_id, story_count, comment_count, looked_up_at)
    SELECT id, CASE WHEN n <= ${expiredWithNext} THEN 12 ELSE 3 END,
      CASE WHEN n <= ${expiredWithNext} THEN 18 ELSE 4 END,
      CASE WHEN n <= ${expiredWithNext} THEN '1800-01-01'::timestamptz + n * interval '1 second'
        ELSE ${now}::timestamptz END
    FROM unnest(${urlIds}::uuid[]) WITH ORDINALITY AS fixture(id, n)
  `)
  await query(sql`
    /* seedHackerNewsRetentionDeleteCapacity:stories */
    INSERT INTO url_hacker_news_stories (url_id, hacker_news_item_id, points, reply_count, posted_at)
    SELECT id, n * 100 + item, 10, 1, ${now}::timestamptz - interval '150 years'
    FROM unnest(${urlIds}::uuid[]) WITH ORDINALITY AS fixture(id, n)
    CROSS JOIN LATERAL generate_series(1, CASE WHEN n <= ${expiredWithNext} THEN 12 ELSE 3 END) AS story(item)
  `)
  await query(sql`
    /* seedHackerNewsRetentionDeleteCapacity:comments */
    INSERT INTO url_hacker_news_comments (url_id, hacker_news_item_id, parent_story_item_id, posted_at)
    SELECT id, n * 100 + 50 + item, n * 100 + 1, ${now}::timestamptz - interval '150 years'
    FROM unnest(${urlIds}::uuid[]) WITH ORDINALITY AS fixture(id, n)
    CROSS JOIN LATERAL generate_series(1, CASE WHEN n <= ${expiredWithNext} THEN 18 ELSE 4 END) AS comment(item)
  `)
  await query.commit()
  return {
    urlIds,
    seededRows: {
      url_hacker_news_totals: urlIds.length,
      url_hacker_news_stories: expiredWithNext * 12 + recentUrls * 3,
      url_hacker_news_comments: expiredWithNext * 18 + recentUrls * 4,
    },
    async cleanup() {
      await write(sql`/* cleanupHackerNewsRetentionDeleteCapacity:urls */
        DELETE FROM urls WHERE id = ANY(${urlIds}::uuid[])`)
      await write(sql`/* cleanupHackerNewsRetentionDeleteCapacity:hostname */
        DELETE FROM url_hostnames WHERE id = ${hostnameId}`)
    },
  }
}
