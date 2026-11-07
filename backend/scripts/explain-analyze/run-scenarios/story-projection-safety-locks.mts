import assert from 'node:assert/strict'
import { beginTransaction, write, type TransactionQuery } from '@data-stores/psql'
import {
  findUnsafeStoryPostRelatedUrlProjectionUrls,
  getStoryPostRelatedUrlProjectionActiveUrls,
} from '@services/stories/story-post-related-url-projection-replacement-safety'
import { findBlockedStoryPostRelatedUrlProjectionUrls } from '@services/stories/story-post-related-url-projection-relation-safety'
import { storiesWorkMaxValues } from '@services/stories/work-limits'
import { POST_URL_CAPACITY_SEED as seed } from '../seed-data/post-related-url-capacity.mts'
import {
  seedStoryProjectionSafetyHosts,
  cleanupStoryProjectionSafetyHosts,
  type SafetyHostFixture,
} from '../seed-data/story-projection-safety-hosts.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

export async function captureStoryProjectionSafetyLocks(): Promise<void> {
  const fixture = await seedStoryProjectionSafetyHosts()
  try {
    await write('/* analyzeStoryProjectionSafetyHosts */ ANALYZE urls, url_hostnames')
    await capturePageLocks(fixture, 1)
    await capturePageLocks(fixture, storiesWorkMaxValues.post_related_url_projection_page_size)
    await captureActiveBlockedRead()
  } finally {
    await cleanupStoryProjectionSafetyHosts(fixture)
    // The deleted 10k-host cohort leaves GIN pending entries. ANALYZE alone retains their
    // startup cost, making later trigram plans depend on whether autovacuum has run.
    await write('/* vacuumStoryProjectionSafetyHostCleanup */ VACUUM (ANALYZE) urls, url_hostnames')
  }
}

async function capturePageLocks(fixture: SafetyHostFixture, pageSize: number): Promise<void> {
  const id =
    pageSize === 1
      ? 'post-url-active-safety-page-locks'
      : 'post-url-active-safety-maximum-page-locks'
  registerScenarioContract(id, {
    seededRows: { urls: 21001, url_hostnames: 10003 },
    expectations: [
      { kind: 'maxProcessedRows', relation: 'urls', max: pageSize },
      { kind: 'maxProcessedRows', relation: 'url_hostnames', max: pageSize * 5 },
    ],
  })
  await runAndCapture(
    id,
    async () => {
      await using query = await beginTransaction()
      const before = await countAdvisoryLocks(query)
      const unsafe = await findUnsafeStoryPostRelatedUrlProjectionUrls(
        query,
        seed.posts[1]!,
        fixture.sources.slice(0, pageSize),
      )
      assert.equal(unsafe.size, 0)
      const after = await countAdvisoryLocks(query)
      assert.equal(
        after - before,
        pageSize + 4,
        'Only page hosts, three parents, and one policy lock',
      )
    },
    undefined,
    'lockStoryPostRelatedUrlProjectionHostnameBlocks',
  )
}

async function captureActiveBlockedRead(): Promise<void> {
  const id = 'post-url-active-safety-blocked-read'
  registerScenarioContract(id, {
    allowEmptyResult: true, // The entire active cohort is safe; the live assertion checks it.
    seededRows: { urls: 21001, url_hostnames: 10003 },
    expectations: [
      { kind: 'maxProcessedRows', relation: 'urls', max: 10000 },
      { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 50000 },
    ],
  })
  await runAndCapture(
    id,
    async () => {
      await using query = await beginTransaction()
      const rows = await getStoryPostRelatedUrlProjectionActiveUrls(query, seed.posts[1]!)
      assert.equal(rows.length, 10000)
      const unsafe = await findBlockedStoryPostRelatedUrlProjectionUrls(
        query,
        rows.map(row => row.url_id),
      )
      assert.equal(unsafe.size, 0)
    },
    undefined,
    'findBlockedStoryPostRelatedUrlProjectionUrls',
  )
}

async function countAdvisoryLocks(query: TransactionQuery): Promise<number> {
  const { rows } = await query<{ count: number }>(
    `/* countStoryProjectionSafetyAdvisoryLocks */
    SELECT count(*)::integer AS count FROM pg_locks
    WHERE pid = pg_backend_pid() AND locktype = 'advisory'`,
  )
  return rows[0]!.count
}
