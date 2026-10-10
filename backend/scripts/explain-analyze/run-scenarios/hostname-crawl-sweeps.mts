import {
  getCrawlHostnameCandidates,
  getNextCrawlHostnameBucket,
} from '@services/crawls/hostname-dispatch-candidates'
import { resolveSeedAnchor } from '../seed-data/seed-anchor.mts'
import { runAndCapture } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'

export async function runHostnameCrawlSweepScenarios(): Promise<void> {
  await runAndCapture('crawl-hostname-threshold-seek', async () => {
    if ((await getNextCrawlHostnameBucket(1)) !== 7)
      throw new Error('Expected indexed seek into the seeded seven-day bucket')
  })
  const sweepStartedAt = new Date(
    resolveSeedAnchor(process.env.EXPLAIN_SEED_ANCHOR_DATE).dayAnchorMs,
  ).toISOString()
  await runAndCapture('crawl-hostnames-due', async () => {
    const rows = await getCrawlHostnameCandidates(
      {
        sweepStartedAt,
        rangeLimit: 10,
        afterBucketDays: 1,
        bucketDays: 7,
      },
      20,
    )
    if (rows.length !== 6 || rows.filter(row => row.range === 0).length !== 3)
      throw new Error(
        'Expected three never-swept and three overdue hostnames, excluding 2000 recent sweeps',
      )
  })
  await runAndCapture('crawl-hostnames-due-capped', async () => {
    const rows = await getCrawlHostnameCandidates(
      { sweepStartedAt, rangeLimit: 2, afterBucketDays: 1, bucketDays: 7 },
      1,
    )
    if (rows.length !== 1 || rows[0]?.range !== 0)
      throw new Error('Expected a single never-swept candidate at the run cap')
  })
}

registerScenarioContract('crawl-hostname-threshold-seek', {
  expectations: [
    { kind: 'usesIndexes', indexes: ['idx_url_hostnames__crawl_due'], noSort: true },
    { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 2 },
  ],
})
registerScenarioContract('crawl-hostnames-due', {
  expectations: [
    { kind: 'usesIndexes', indexes: ['idx_url_hostnames__crawl_due'], noSort: true },
    { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 8 },
  ],
})

registerScenarioContract('crawl-hostnames-due-capped', {
  expectations: [
    { kind: 'usesIndexes', indexes: ['idx_url_hostnames__crawl_due'], noSort: true },
    { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 3 },
  ],
})
