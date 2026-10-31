import { write } from '@data-stores/psql'
import assert from 'node:assert/strict'
import { searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId } from '@services/crawlers/boilerplate-removal'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { crawlSeedUuid, seedUuid } from '../seed-data/common.mts'

const URL_LOWER = '019e0000-9a00-7000-8000-000000000000'
const URL_UPPER = '019e0000-9a00-7000-8000-000000002000'

export async function runCrawlerBoilerplateScenario(): Promise<void> {
  const crawlLower = crawlSeedUuid(0, '9b')
  const crawlPrefix = crawlLower.slice(0, 24)
  const crawlUpper = `${crawlPrefix}000000002000`
  try {
    await write(
      `/* seedExplainBoilerplateUrls */ INSERT INTO urls
        (id, url, hostname_id, pathname, search_params)
       SELECT ($1::text || lpad(n::text, 12, '0'))::uuid,
         'https://seed-host-0.example.com/explain-blog/' || n,
         $2::uuid, '/explain-blog/' || n, '{}'::jsonb
       FROM generate_series(0, 1999) AS n ON CONFLICT DO NOTHING`,
      [URL_LOWER.slice(0, 24), seedUuid(0, '02')],
    )
    await write(
      `/* seedExplainBoilerplateCrawls */ INSERT INTO crawls
         (id, url_id, response_status_code, markdown, completed_at,
          html_sha256, html_snapshot_uploaded_at)
       SELECT ($1::text || lpad(n::text, 12, '0'))::uuid,
         ($2::text || lpad(n::text, 12, '0'))::uuid,
         200, 'EXPLAIN HTML body', NOW() - (n % 20) * INTERVAL '1 hour',
         decode(repeat('11', 32), 'hex'), NOW() - (n % 20) * INTERVAL '1 hour'
       FROM generate_series(0, 1999) AS n ON CONFLICT DO NOTHING`,
      [crawlPrefix, URL_LOWER.slice(0, 24)],
    )
    await write(`/* seedExplainBoilerplate:analyze */ ANALYZE urls`)
    await write(`/* seedExplainBoilerplate:analyze */ ANALYZE crawls`)
    registerScenarioContract('crawler-boilerplate-candidates', {
      // Custom plans scan this 2k same-host corpus; generic plans use hostname/crawl indexes.
      expectations: [
        { kind: 'maxProcessedRows', relation: 'urls', max: 7_300 },
        { kind: 'maxProcessedRows', relation: 'crawls', max: 2_600 },
      ],
      seededRows: { urls: 5100, crawls: 2500 },
      crossPartition: {
        crawls: 'Recent HTML snapshots can exist in any crawl ID range for a URL.',
      },
    })
    await runAndCapture(
      'crawler-boilerplate-candidates',
      async () => {
        const candidates = await searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId(
          seedUuid(0, '02'),
          '/explain-blog',
          3,
        )
        assert.equal(candidates.length, 3, 'The seeded recent HTML corpus must fill the page')
      },
      undefined,
      'searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId',
    )
  } finally {
    await write(
      `/* seedExplainBoilerplate:removeCrawls */ DELETE FROM crawls
      WHERE id >= $1::uuid AND id < $2::uuid`,
      [crawlLower, crawlUpper],
    )
    await write(
      `/* seedExplainBoilerplate:removeUrls */ DELETE FROM urls
      WHERE id >= $1::uuid AND id < $2::uuid`,
      [URL_LOWER, URL_UPPER],
    )
  }
}
