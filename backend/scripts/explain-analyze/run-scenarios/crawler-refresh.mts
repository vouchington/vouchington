import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { searchCrawlerRefreshUrlCandidatesByHostnameId } from '@services/crawlers/refresh'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid, seedUuidAtTimestamp } from '../seed-data/common.mts'
import { resolveSeedAnchor } from '../seed-data/seed-anchor.mts'

const HOSTNAME_ID = seedUuid(0, '9d')
const BACKGROUND_HOSTNAME_ID = seedUuid(1, '9d')
const BACKGROUND_URL_COUNT = 20_000
const BACKGROUND_HOSTNAME = 'explain-crawler-refresh-background.example.com'
const URL_PREFIX = seedUuid(0, '9e').slice(0, 24)
const URL_UPPER = seedUuid(2000, '9e')
const URL_COUNT = 2000
const CRAWLED_COUNT = 1997
const HISTORY_COUNT = 10

/** Own a separate hostname so unrelated seed URLs cannot change the selected page. */
export async function seedCrawlerRefreshScenario(): Promise<void> {
  const anchor = resolveSeedAnchor(process.env.EXPLAIN_SEED_ANCHOR_DATE).dayAnchorMs
  const crawlPrefixes = Array.from({ length: HISTORY_COUNT }, (_, index) =>
    seedUuidAtTimestamp(
      index === HISTORY_COUNT - 1 ? anchor - 60_000 : anchor - (HISTORY_COUNT - index) * 86_400_000,
      0,
    ).slice(0, 24),
  )
  const { rows: hostnames } = await write<{ id: string }>(
    `/* seedExplainCrawlerRefreshHostname */ INSERT INTO url_hostnames (id, hostname)
     VALUES ($1::uuid, 'explain-crawler-refresh.example.com'), ($2::uuid, $3::text)
     ON CONFLICT (id) DO UPDATE SET hostname = EXCLUDED.hostname
       WHERE url_hostnames.hostname = EXCLUDED.hostname RETURNING id`,
    [HOSTNAME_ID, BACKGROUND_HOSTNAME_ID, BACKGROUND_HOSTNAME],
  )
  assert.equal(hostnames.length, 2, 'Reserved refresh hostname IDs must retain their fixture tags')
  const { rows: collisions } = await write<{ id: string }>(
    `/* checkExplainCrawlerRefreshUrlTags */ SELECT id FROM urls
     WHERE (id >= $1::uuid AND id < $2::uuid
       AND (hostname_id <> $3::uuid OR url <> 'https://explain-crawler-refresh.example.com/' ||
         (('x' || right(replace(id::text, '-', ''), 8))::bit(32)::bigint)::text))
       OR (id >= $4::uuid AND id < $5::uuid
       AND (hostname_id <> $6::uuid OR url <> 'https://' || $7::text || '/' ||
         (('x' || right(replace(id::text, '-', ''), 8))::bit(32)::bigint)::text))
     LIMIT 1`,
    [
      seedUuid(0, '9e'),
      URL_UPPER,
      HOSTNAME_ID,
      seedUuid(0, '9f'),
      seedUuid(BACKGROUND_URL_COUNT, '9f'),
      BACKGROUND_HOSTNAME_ID,
      BACKGROUND_HOSTNAME,
    ],
  )
  assert.equal(collisions.length, 0, 'Reserved refresh URL IDs must retain their fixture tags')
  await write(
    `/* seedExplainCrawlerRefreshBackgroundUrls */ INSERT INTO urls
       (id, url, hostname_id, pathname, search_params)
     SELECT ($1::text || lpad(to_hex(n), 12, '0'))::uuid,
       'https://' || $2::text || '/' || n, $3::uuid, '/' || n, '{}'::jsonb
     FROM generate_series(0, $4::integer - 1) AS n ON CONFLICT DO NOTHING`,
    [
      seedUuid(0, '9f').slice(0, 24),
      BACKGROUND_HOSTNAME,
      BACKGROUND_HOSTNAME_ID,
      BACKGROUND_URL_COUNT,
    ],
  )
  await write(
    `/* seedExplainCrawlerRefreshUrls */ INSERT INTO urls
       (id, url, hostname_id, pathname, search_params)
     SELECT ($1::text || lpad(to_hex(n), 12, '0'))::uuid,
       'https://explain-crawler-refresh.example.com/' || n,
       $2::uuid, '/' || n, '{}'::jsonb
     FROM generate_series(0, $3::integer - 1) AS n ON CONFLICT DO NOTHING`,
    [URL_PREFIX, HOSTNAME_ID, URL_COUNT],
  )
  await write(
    `/* seedExplainCrawlerRefreshCrawls */ INSERT INTO crawls
       (id, url_id, response_status_code, network_error, markdown, completed_at)
     SELECT (prefix || lpad(to_hex(n), 12, '0'))::uuid,
       ($1::text || lpad(to_hex(n), 12, '0'))::uuid,
       CASE WHEN n < 1000 THEN 503 ELSE 200 END,
       CASE WHEN n < 1000 THEN 'timeout'::crawl_network_errors ELSE NULL END, '',
       uuid_extract_timestamp((prefix || lpad(to_hex(n), 12, '0'))::uuid)
     FROM unnest($2::text[]) AS prefix
     CROSS JOIN generate_series(0, $3::integer - 1) AS n ON CONFLICT DO NOTHING`,
    [URL_PREFIX, crawlPrefixes, CRAWLED_COUNT],
  )
  await write(
    `/* seedExplainCrawlerRefreshRecency */ UPDATE urls
     SET last_crawl_attempt_at = CURRENT_TIMESTAMP - INTERVAL '1 minute',
       last_successful_crawl_at = CASE WHEN id >= $2::uuid
         THEN CURRENT_TIMESTAMP - INTERVAL '1 minute' ELSE NULL END
     WHERE hostname_id = $1::uuid AND id < $3::uuid`,
    [HOSTNAME_ID, seedUuid(1000, '9e'), seedUuid(CRAWLED_COUNT, '9e')],
  )
  await write(`/* seedExplainCrawlerRefreshAnalyze */ ANALYZE url_hostnames, urls, crawls`)
}

export async function cleanupCrawlerRefreshScenario(): Promise<void> {
  await write(
    `/* cleanupExplainCrawlerRefreshCrawls */ DELETE FROM crawls
     WHERE url_id >= $1::uuid AND url_id < $2::uuid`,
    [seedUuid(0, '9e'), URL_UPPER],
  )
  await write(
    `/* cleanupExplainCrawlerRefreshUrls */ DELETE FROM urls WHERE hostname_id = ANY($1::uuid[])`,
    [[HOSTNAME_ID, BACKGROUND_HOSTNAME_ID]],
  )
  await write(
    `/* cleanupExplainCrawlerRefreshHostname */ DELETE FROM url_hostnames WHERE id = ANY($1::uuid[])`,
    [[HOSTNAME_ID, BACKGROUND_HOSTNAME_ID]],
  )
}

export async function selectCrawlerRefreshScenario(): Promise<void> {
  const candidates = await searchCrawlerRefreshUrlCandidatesByHostnameId(HOSTNAME_ID, 3)
  assert.equal(candidates.length, 3, 'The never-crawled URLs must fill the candidate page')
  assert.deepEqual(
    new Set(candidates.map(candidate => candidate.id)),
    new Set(Array.from({ length: 3 }, (_, index) => seedUuid(CRAWLED_COUNT + index, '9e'))),
  )
}

export async function selectCrawlerRefreshBacklogScenario(): Promise<void> {
  const candidates = await searchCrawlerRefreshUrlCandidatesByHostnameId(HOSTNAME_ID, 3)
  assert.deepEqual(
    candidates.map(candidate => candidate.id),
    Array.from({ length: 3 }, (_, index) => seedUuid(index, '9e')),
  )
}

export async function runCrawlerRefreshScenario(): Promise<void> {
  await seedCrawlerRefreshScenario()
  try {
    registerScenarioContract('crawler-refresh-candidates', {
      expectations: [
        { kind: 'usesIndexes', indexes: ['idx_urls__hostname_crawl_recency'], noSort: true },
        { kind: 'maxProcessedRows', relation: 'urls', max: 1003 },
      ],
      seededRows: { urls: 25_100, crawls: 20_470 },
    })
    await runAndCapture(
      'crawler-refresh-candidates',
      selectCrawlerRefreshScenario,
      undefined,
      'searchCrawlerRefreshUrlCandidatesByHostnameId',
    )
    // The same graph with expired attempts isolates index-ordered backlog selection.
    await write(
      `/* seedExplainCrawlerRefreshExpiredAttempts */ UPDATE urls
       SET last_crawl_attempt_at = CURRENT_TIMESTAMP - INTERVAL '8 days'
       WHERE hostname_id = $1::uuid AND last_crawl_attempt_at IS NOT NULL`,
      [HOSTNAME_ID],
    )
    await write(`/* seedExplainCrawlerRefreshBacklogAnalyze */ ANALYZE urls`)
    registerScenarioContract('crawler-refresh-backlog', {
      expectations: [
        { kind: 'usesIndexes', indexes: ['idx_urls__hostname_crawl_recency'], noSort: true },
        { kind: 'maxProcessedRows', relation: 'urls', max: 3 },
      ],
      seededRows: { urls: 25_100, crawls: 20_470 },
    })
    await runAndCapture(
      'crawler-refresh-backlog',
      selectCrawlerRefreshBacklogScenario,
      undefined,
      'searchCrawlerRefreshUrlCandidatesByHostnameId',
    )
  } finally {
    await cleanupCrawlerRefreshScenario()
  }
}
