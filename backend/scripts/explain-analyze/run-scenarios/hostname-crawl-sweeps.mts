import {
  getCrawlHostnameCandidates,
  getNextCrawlHostnameBucket,
} from '@services/crawls/hostname-dispatch-candidates'
import { resolveSeedAnchor } from '../seed-data/seed-anchor.mts'
import { runAndCapture } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { deleteOldInvalidCrawls } from '@services/crawls/cleanup'
import { write } from '@data-stores/psql'
import { sweepNextBoilerplateHostnameBatch } from '@services/boilerplate-removals'
import {
  BOILERPLATE_BATCH_CURSOR,
  BOILERPLATE_BATCH_HOSTNAME_COUNT,
  BOILERPLATE_BATCH_PATHS_PER_HOSTNAME,
  withBoilerplateRemovalBatch,
} from '../seed-data/boilerplate-removal-batch.mts'
import { crawlSeedUuid, seedUuid, seedUuidAtTimestamp } from '../seed-data/common.mts'

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
    if (rows.length !== 20 || rows.filter(row => row.is_due).length !== 6)
      throw new Error(
        'Expected one immutable-id page containing the six due hosts before recent sweeps',
      )
  })
  await runAndCapture('crawl-hostnames-due-capped', async () => {
    const rows = await getCrawlHostnameCandidates(
      { sweepStartedAt, rangeLimit: 2, afterBucketDays: 1, bucketDays: 7 },
      1,
    )
    if (rows.length !== 1 || !rows[0]?.is_due)
      throw new Error('Expected a single never-swept candidate at the run cap')
  })
  await withBoilerplateRemovalBatch(() =>
    runAndCapture(
      'boilerplate-removal-hostname-batch',
      async () => {
        await write(
          `/* seedExplainBoilerplateCursor */ INSERT INTO boilerplate_removal_hostname_cursors
             (is_singleton, cursor_hostname_id) VALUES (TRUE, $1::uuid)
           ON CONFLICT (is_singleton) DO UPDATE SET cursor_hostname_id = EXCLUDED.cursor_hostname_id`,
          [BOILERPLATE_BATCH_CURSOR],
        )
        const rows = await sweepNextBoilerplateHostnameBatch(
          { hostnameBatchSize: BOILERPLATE_BATCH_HOSTNAME_COUNT, candidateLimit: 500 },
          async () => undefined,
        )
        if (rows.length !== BOILERPLATE_BATCH_HOSTNAME_COUNT * BOILERPLATE_BATCH_PATHS_PER_HOSTNAME)
          throw new Error('Expected every seeded hostname batch parent path to need removal')
      },
      undefined,
      ['listBoilerplateRemovalHostnameBatch', 'searchParentPathsNeedingBoilerplateRemoval'],
    ),
  )
  // The fresh bootstrap only creates current crawl partitions; a fixed future cutoff makes
  // this same bounded candidate shape eligible without inserting into a retired partition.
  const oldId = crawlSeedUuid(0, '9c')
  const oldIdPrefix = oldId.slice(0, 24)
  const upperId = seedUuidAtTimestamp(Date.now() + 86_400_000, 0)
  try {
    await write(
      `/* seedExplainInvalidCrawls */ INSERT INTO crawls
         (id, url_id, network_error, response_status_code, markdown)
       SELECT ($1::text || lpad(n::text, 12, '0'))::uuid, $2::uuid,
         'timeout'::crawl_network_errors, 503, ''
       FROM generate_series(0, 19999) AS n ON CONFLICT DO NOTHING`,
      [oldIdPrefix, seedUuid(0, '03')],
    )
    await write(`/* seedExplainInvalidCrawls:analyze */ ANALYZE crawls`)
    registerScenarioContract('crawl-invalid-retention', {
      expectations: [{ kind: 'maxProcessedRows', relation: 'crawls', max: 40 }],
      seededRows: { crawls: 20_500 },
      crossPartition: {
        crawls: 'The cleanup scans every crawl ID range older than its retained age cutoff.',
      },
    })
    await runAndCapture(
      'crawl-invalid-retention',
      async () => {
        const result = await deleteOldInvalidCrawls({ cutoffId: upperId, limit: 10 })
        if (result.deleted !== 10 || !result.hasMore)
          throw new Error('Invalid crawl cleanup must delete a full page and leave more work')
      },
      undefined,
      'deleteOldInvalidCrawls',
    )
  } finally {
    await write(
      `/* seedExplainInvalidCrawls:remove */ DELETE FROM crawls
       WHERE id >= $1::uuid AND id < $2::uuid AND network_error = 'timeout'`,
      [oldId, `${oldIdPrefix}000000020000`],
    )
  }
}

registerScenarioContract('boilerplate-removal-hostname-batch', {
  expectations: [
    {
      kind: 'usesIndexes',
      indexes: ['url_hostnames_pkey'],
      queryContains: 'listBoilerplateRemovalHostnameBatch',
      noSort: true,
    },
    {
      kind: 'usesIndexes',
      indexes: ['idx_urls__hostname_id'],
      queryContains: 'searchParentPathsNeedingBoilerplateRemoval',
    },
    {
      kind: 'queryBinds',
      token: 'ANY',
      queryContains: 'searchParentPathsNeedingBoilerplateRemoval',
    },
    { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 700 },
    { kind: 'maxProcessedRows', relation: 'urls', max: 700 },
  ],
  crossPartition: {
    crawls:
      'The recent-HTML-crawl count probes each candidate url by url_id, and crawl ids are time-ordered so those rows span every crawls partition.',
  },
})
registerScenarioContract('crawl-hostname-threshold-seek', {
  expectations: [
    {
      kind: 'usesIndexes',
      indexes: [
        'idx_url_hostnames__crawl_due',
        'idx_url_hostnames__age_threshold_days_id_crawlable',
      ],
      anyOf: true,
      noSort: true,
    },
    { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 2 },
  ],
})
registerScenarioContract('crawl-hostnames-due', {
  expectations: [
    {
      kind: 'usesIndexes',
      indexes: ['idx_url_hostnames__age_threshold_days_id_crawlable'],
      noSort: true,
    },
    { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 20 },
  ],
})

registerScenarioContract('crawl-hostnames-due-capped', {
  expectations: [
    {
      kind: 'usesIndexes',
      indexes: ['idx_url_hostnames__age_threshold_days_id_crawlable'],
      noSort: true,
    },
    { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 3 },
  ],
})
