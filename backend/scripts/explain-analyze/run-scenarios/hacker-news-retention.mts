import assert from 'node:assert/strict'
import { cleanupHackerNewsReferences } from '@services/data-retention/cleanup-hacker-news'
import {
  getHackerNewsWorkLimit,
  hackerNewsWorkConfig,
} from '@services/urls/hacker-news-work-limits'
import { write } from '@data-stores/psql'
import { seedHackerNewsRetention } from '../seed-data/hacker-news-retention.mts'
import { seedUuid } from '../seed-data/common.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

export async function runHackerNewsRetentionScenario(): Promise<void> {
  await hackerNewsWorkConfig.waitForInitialization()
  const batchSize = getHackerNewsWorkLimit('retention_batch_size')
  const maxBatches = getHackerNewsWorkLimit('retention_max_batches')
  const expiredRows = Math.min(19_999, Math.max(5_000, batchSize * 3 + 1))
  const expectedDeleted = Math.min(expiredRows, batchSize * maxBatches)
  const childRows = Math.min(expectedDeleted, 25)
  const restoreFixture = () => seedHackerNewsRetention(expiredRows, childRows)
  await restoreFixture()
  registerScenarioContract('hacker-news-retention-page', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_url_hacker_news_totals__looked_up_at__url_id'],
        noSort: true,
      },
      { kind: 'maxProcessedRows', relation: 'url_hacker_news_totals', max: batchSize },
    ],
    seededRows: { url_hacker_news_totals: 20_000 },
  })
  await runAndCapture(
    'hacker-news-retention-page',
    async () => {
      const result = await cleanupHackerNewsReferences()
      assert.equal(
        result.deleted,
        expectedDeleted,
        'The Hacker News retention sweep must delete only its configured bounded backlog',
      )
      const { rows } = await write<{ totals: string; stories: string; comments: string }>(
        `/* assertExplainHackerNewsRetention */
         SELECT
           (SELECT count(*) FROM url_hacker_news_totals
            WHERE url_id >= $1::uuid AND url_id < $2::uuid)::text AS totals,
           (SELECT count(*) FROM url_hacker_news_stories
            WHERE url_id >= $1::uuid AND url_id < $3::uuid)::text AS stories,
           (SELECT count(*) FROM url_hacker_news_comments
            WHERE url_id >= $1::uuid AND url_id < $3::uuid)::text AS comments`,
        [seedUuid(100_000, '03'), seedUuid(120_000, '03'), seedUuid(100_025, '03')],
      )
      assert.equal(Number(rows[0]?.totals), 20_000 - expectedDeleted)
      assert.equal(Number(rows[0]?.stories), 0)
      assert.equal(Number(rows[0]?.comments), 0)
    },
    undefined,
    'selectExpiredHackerNewsReferences',
    { afterCapture: restoreFixture },
  )
}
