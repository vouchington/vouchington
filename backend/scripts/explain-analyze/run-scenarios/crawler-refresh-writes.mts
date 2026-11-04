import assert from 'node:assert/strict'
import { beginTransaction, write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { createCrawl } from '@services/crawls/create'
import { updateCrawl } from '@services/crawls/update'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

/** Real production marker writes must point-update state without revising URL content. */
export async function runCrawlerRefreshWriteScenarios(
  hostnameId: string,
  urlId: string,
): Promise<void> {
  const crawlerId = seedUuid(2, '9d')
  await write(
    `/* seedExplainCrawlerRefreshWriter */ INSERT INTO hostname_crawler_configurations
      (id, hostname_id, crawler_type) VALUES ($1::uuid, $2::uuid, 'fetch')
      ON CONFLICT (id) DO NOTHING`,
    [crawlerId, hostnameId],
  )
  for (const id of ['crawler-refresh-attempt-write', 'crawler-refresh-success-write'] as const) {
    registerScenarioContract(id, {
      expectations: [
        { kind: 'usesIndexes', indexes: ['url_crawl_state_pkey'] },
        { kind: 'maxProcessedRows', relation: 'url_crawl_state', max: 2 },
        { kind: 'maxProcessedRows', relation: 'urls', max: 0 },
      ],
      seededRows: { url_crawl_state: 25_100 },
    })
  }
  const revision = await readRevision(urlId)
  await runAndCapture(
    'crawler-refresh-attempt-write',
    async () => {
      await using transaction = await beginTransaction()
      await createCrawl(urlId, crawlerId, {}, { query: transaction })
      assert.equal(await readRevision(urlId, { query: transaction }), revision)
    },
    undefined,
    'createCrawl',
  )

  // The capture harness replays each statement in its own rolled-back transaction. Keep this
  // pending crawl until the caller removes the owned URL history, so UPDATE replays find a row.
  const crawl = await createCrawl(urlId, crawlerId)
  await runAndCapture(
    'crawler-refresh-success-write',
    async () => {
      await using transaction = await beginTransaction()
      await updateCrawl(crawl.id, urlId, { completed_at: new Date() }, { query: transaction })
      assert.equal(await readRevision(urlId, { query: transaction }), revision)
    },
    undefined,
    'updateCrawl',
  )
}

async function readRevision(urlId: string, options: QueryOptions = {}): Promise<string> {
  const { rows } = await write<{ revision: string }>(
    `/* readCrawlerRefreshUrlRevision */ SELECT updated_at::text AS revision FROM urls WHERE id = $1 LIMIT 1`,
    [urlId],
    options,
  )
  assert.ok(rows[0], 'The owned URL must exist')
  return rows[0].revision
}
