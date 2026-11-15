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
  let rejectedId: string | undefined
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
    rejectedId = (
      await write<{ id: string }>(
        `/* seedExplainBoilerplateRejectedHead */ INSERT INTO crawls(url_id,response_status_code,markdown,completed_at)
       VALUES($1,304,'',CURRENT_TIMESTAMP) RETURNING id`,
        [`${URL_LOWER.slice(0, 24)}000000000001`],
      )
    ).rows[0]!.id
    await write(`/* seedExplainBoilerplate:analyze */ ANALYZE urls`)
    await write(`/* seedExplainBoilerplate:analyze */ ANALYZE crawls`)
    registerScenarioContract('crawler-boilerplate-candidates', {
      // Custom plans scan the shared URL corpus, including referral benchmark URLs;
      // generic plans use hostname/crawl indexes. The 2k same-host candidates are unchanged.
      expectations: [
        { kind: 'maxProcessedRows', relation: 'urls', max: 14_200 },
        { kind: 'maxProcessedRows', relation: 'crawls', max: 2_600 },
      ],
      seededRows: { urls: 14_100, crawls: 2500 },
      crossPartition: {
        crawls: 'Recent HTML snapshots can exist in any crawl ID range for a URL.',
      },
    })
    await runAndCapture(
      'crawler-boilerplate-candidates',
      async () => {
        const first = await searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId(
          seedUuid(0, '02'),
          '/explain-blog',
          3,
          {},
          () => new Date(),
          URL_LOWER,
        )
        assert.equal(first.candidates.length, 0, 'The rejected raw head must remain pending')
        assert.ok(first.after && first.crawl_after)
        const second = await searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId(
          seedUuid(0, '02'),
          '/explain-blog',
          3,
          {},
          () => new Date(),
          first.after,
          first.crawl_after,
          first.crawl_probe_id,
        )
        assert.ok(second.after, 'Resolving the pending URL must retain later URL work')
        const third = await searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId(
          seedUuid(0, '02'),
          '/explain-blog',
          3,
          {},
          () => new Date(),
          second.after,
          second.crawl_after,
          second.crawl_probe_id,
        )
        assert.ok(third.after, 'The next bounded page must retain its continuation')
        const fourth = await searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId(
          seedUuid(0, '02'),
          '/explain-blog',
          3,
          {},
          () => new Date(),
          third.after,
          third.crawl_after,
          third.crawl_probe_id,
        )
        const candidates = [...second.candidates, ...third.candidates, ...fourth.candidates]
        assert.deepEqual(
          candidates.map(candidate => candidate.id),
          [1, 2, 3].map(index => `${URL_LOWER.slice(0, 24)}${String(index).padStart(12, '0')}`),
        )
        assert.equal(candidates.length, 3, 'The seeded recent HTML corpus must fill the page')
      },
      undefined,
      [
        'searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId',
        'readBoilerplateCrawlProbes',
        'readBoilerplateCrawlPage',
        'readBoilerplateCrawlMetadata',
      ],
    )
  } finally {
    if (rejectedId)
      await write('/* cleanupExplainBoilerplateRejectedHead */ DELETE FROM crawls WHERE id=$1', [
        rejectedId,
      ])
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
