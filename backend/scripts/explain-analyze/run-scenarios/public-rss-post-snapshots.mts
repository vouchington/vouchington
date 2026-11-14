import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { getPublicRssPostSnapshotsCached } from '@services/posts/public-rss-snapshots'
import type { PostSearchOptions } from '@services/posts/search/types'
import { clearTestRssSnapshotCacheKey } from '@voucha/test-helpers/rss-snapshot-cache-key'
import { registerScenarioContract } from '../plan-expectations.mts'
import { getPostIds } from '../run-services.mts'
import { runAndCapture } from '../run-support.mts'

const PAGE_SIZE = 25
const SNAPSHOT_QUERY = 'getPublicRssPostSnapshots'
// Measured in both plan modes: 100 posts rows for 25 returned snapshots, plus 20% headroom.
const POSTS_ROW_BUDGET = 120

/** Measure the RSS cache fill, including publication eligibility and complete post hydration. */
export async function runPublicRssPostSnapshotScenarios(): Promise<void> {
  const options: PostSearchOptions = {
    post_types: ['discussion'],
    sort: 'new',
    time_range: 'all',
    limit: PAGE_SIZE,
  }
  const first = await getPostIds(undefined, options)
  assert.equal(first.results.length, PAGE_SIZE)
  assert.equal(first.page_info.has_next_page, true)
  const after = first.page_info.end_cursor
  assert.ok(after, 'RSS snapshot fixtures need a continuation cursor')
  const continuation = await getPostIds(undefined, { ...options, after })
  assert.equal(continuation.results.length, PAGE_SIZE)
  const firstIds = first.results.map(post => post.id)
  const continuationIds = continuation.results.map(post => post.id)
  assert.equal(new Set([...firstIds, ...continuationIds]).size, PAGE_SIZE * 2)

  await captureSnapshots('rss-public-post-snapshots-first', firstIds, POSTS_ROW_BUDGET)
  await captureSnapshots(
    'rss-public-post-snapshots-continuation',
    continuationIds,
    POSTS_ROW_BUDGET,
  )
  // A nonempty missing-id input must execute the SQL rather than take its empty-array shortcut.
  await captureSnapshots('rss-public-post-snapshots-absent', [randomUUID()], 8, [])
}

async function captureSnapshots(
  scenarioId: string,
  postIds: string[],
  maxPostsRows: number,
  expectedIds = postIds,
): Promise<void> {
  registerScenarioContract(scenarioId, {
    allowEmptyResult: expectedIds.length === 0,
    expectations: [{ kind: 'maxProcessedRows', relation: 'posts', max: maxPostsRows }],
  })
  await clearTestRssSnapshotCacheKey(postIds)
  await runAndCapture(
    scenarioId,
    async () => {
      const snapshots = await getPublicRssPostSnapshotsCached({ postIds })
      assert.deepEqual(
        snapshots.map(post => post.id),
        expectedIds,
      )
    },
    undefined,
    SNAPSHOT_QUERY,
    { exactCapturedNames: [SNAPSHOT_QUERY] },
  )
}
