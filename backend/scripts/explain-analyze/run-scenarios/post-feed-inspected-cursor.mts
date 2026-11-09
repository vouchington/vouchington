import assert from 'node:assert/strict'
import { getPostFeedIds } from '@services/feeds'
import { postsWorkConfig } from '@services/posts/work-limits'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { registerScenarioContract } from '../plan-expectations.mts'
import { heavyFollowUser, runAndCapture, seedUser } from '../run-support.mts'
import { withSeedAnchorClock } from '../seed-clock.mts'
import { SEEDED_ROWS_BY_RELATION } from '../plan-seeded-rows.mts'
import { seedUuid } from '../seed-data/common.mts'
import {
  cursorBeforePostFeedSeedShare,
  cleanupPostFeedInspectedCursorFixture,
  POST_FEED_INSPECTED_CURSOR_FIXTURE,
  seedPostFeedInspectedCursorFixture,
} from '../seed-data/post-feed-inspected-cursor.mts'

const LOW_CANDIDATE_LIMIT = 2
const LOW_CANDIDATE_POST_ROWS = (LOW_CANDIDATE_LIMIT + 1) * 4
const LOW_CANDIDATE_SHARE_ROWS = (LOW_CANDIDATE_LIMIT + 1) ** 2
const LOW_CANDIDATE_BITMAP_ROWS = (LOW_CANDIDATE_LIMIT + 1) ** 2
const SHARE_PAGE_SIZE = 1

const inspectedFixtureSeededRows: Readonly<Record<string, number>> = {
  ...SEEDED_ROWS_BY_RELATION,
  posts: SEEDED_ROWS_BY_RELATION.posts! + 3,
  post_clearance_changes: SEEDED_ROWS_BY_RELATION.post_clearance_changes! + 3,
  topics: SEEDED_ROWS_BY_RELATION.topics! + 2,
  relation__post__category__topic: SEEDED_ROWS_BY_RELATION.relation__post__category__topic! + 3,
}

function lowCandidateExpectations() {
  return [
    { kind: 'maxProcessedRows' as const, relation: 'posts', max: LOW_CANDIDATE_POST_ROWS },
    {
      kind: 'maxProcessedRows' as const,
      relation: 'post_feed_shares',
      max: LOW_CANDIDATE_SHARE_ROWS,
    },
    { kind: 'maxBitmapIndexRows' as const, max: LOW_CANDIDATE_BITMAP_ROWS },
  ]
}

function registerLowCandidateScenario(id: string): void {
  registerScenarioContract(id, {
    seededRows: inspectedFixtureSeededRows,
    expectations: lowCandidateExpectations(),
    forbidSequentialScans: ['post_feed_shares'],
    crossPartition: {
      posts: 'The feed advances its bounded raw delivery prefix across post partitions.',
    },
  })
}

function registerShareFanoutScenario(id: string): void {
  registerScenarioContract(id, {
    seededRows: SEEDED_ROWS_BY_RELATION,
    expectations: lowCandidateExpectations(),
    forbidSequentialScans: ['post_feed_shares'],
    crossPartition: {
      posts: 'Ranked feeds retain the post rank while paging that post’s share deliveries.',
    },
  })
}

export async function runPostFeedInspectedCursorScenarios(): Promise<void> {
  let restore = () => {}
  try {
    await seedPostFeedInspectedCursorFixture()
    await postsWorkConfig.waitForInitialization()
    restore = overrideDynamicConfigFieldsForTest(postsWorkConfig, {
      post_feed_candidate_limit: LOW_CANDIDATE_LIMIT,
    })
    await captureSparseNewFeedPages()
    await cleanupPostFeedInspectedCursorFixture()
    await captureRankedShareContinuation('hot')
    await captureRankedShareContinuation('best')
  } finally {
    restore()
    await cleanupPostFeedInspectedCursorFixture()
  }
}

async function captureSparseNewFeedPages(): Promise<void> {
  const options = {
    feed_type: 'follow_users' as const,
    sort: 'new' as const,
    time_range: '1w' as const,
    universal_topic_ids: POST_FEED_INSPECTED_CURSOR_FIXTURE.topicIds,
    limit: SHARE_PAGE_SIZE,
  }
  let firstCursor: string | null = null
  registerLowCandidateScenario('post-feed-inspected-empty')
  await runAndCapture(
    'post-feed-inspected-empty',
    async () => {
      const page = await getPostFeedIds(heavyFollowUser, options)
      assert.equal(page.results.length, 0)
      assert.equal(page.page_info.has_next_page, true)
      assert.ok(page.page_info.end_cursor)
      firstCursor = page.page_info.end_cursor
    },
    undefined,
    'getPostFeedIds',
  )

  if (!firstCursor) throw new Error('Empty post feed page did not return its continuation cursor')
  let secondCursor: string | null = null
  registerLowCandidateScenario('post-feed-inspected-match')
  await runAndCapture(
    'post-feed-inspected-match',
    async () => {
      const page = await getPostFeedIds(heavyFollowUser, { ...options, after: firstCursor! })
      assert.equal(page.results.length, 1)
      assert.equal(page.results[0]?.entity_id, POST_FEED_INSPECTED_CURSOR_FIXTURE.matchingPostId)
      assert.equal(page.page_info.has_next_page, true)
      assert.ok(page.page_info.end_cursor)
      assert.notEqual(page.page_info.end_cursor, firstCursor)
      secondCursor = page.page_info.end_cursor
    },
    undefined,
    'getPostFeedIds',
  )

  if (!secondCursor)
    throw new Error('Post feed match page did not advance its inspected-delivery cursor')
  registerLowCandidateScenario('post-feed-inspected-empty-after-match')
  await runAndCapture(
    'post-feed-inspected-empty-after-match',
    async () => {
      const page = await getPostFeedIds(heavyFollowUser, { ...options, after: secondCursor! })
      assert.equal(page.results.length, 0)
      assert.equal(page.page_info.has_next_page, true)
      assert.ok(page.page_info.end_cursor)
      assert.notEqual(page.page_info.end_cursor, secondCursor)
    },
    undefined,
    'getPostFeedIds',
  )
}

async function captureRankedShareContinuation(mode: 'hot' | 'best') {
  const prefix = `post-feed-${mode}-share-fanout`
  const timeRange: '1w' | 'all' = mode === 'hot' ? '1w' : 'all'
  const options = {
    feed_type: 'follow_users' as const,
    sort: 'hot' as const,
    time_range: timeRange,
    limit: SHARE_PAGE_SIZE,
  }
  const asOf = await withSeedAnchorClock(async () => new Date())
  const beforeShare = await cursorBeforePostFeedSeedShare(mode, asOf)
  let after: string | null = null
  let firstResult: { id: string; entity_id: string } | null = null
  registerShareFanoutScenario(`${prefix}-first`)
  await runAndCapture(
    `${prefix}-first`,
    async () => {
      const page = await getPostFeedIds(seedUser, { ...options, after: beforeShare }, asOf)
      assert.equal(page.results.length, 1)
      assert.equal(page.results[0]?.delivery_type, 'share')
      assert.equal(page.results[0]?.entity_id, seedUuid(2, '05'))
      assert.equal(page.page_info.has_next_page, true)
      assert.ok(page.page_info.end_cursor)
      firstResult = { id: page.results[0]!.id, entity_id: page.results[0]!.entity_id }
      after = page.page_info.end_cursor
    },
    undefined,
    'getPostFeedIds',
  )

  if (!after || !firstResult)
    throw new Error(`${prefix} first share page did not return a continuation cursor`)
  registerShareFanoutScenario(`${prefix}-after`)
  await runAndCapture(
    `${prefix}-after`,
    async () => {
      const page = await getPostFeedIds(seedUser, { ...options, after: after ?? undefined }, asOf)
      assert.equal(page.results.length, 1)
      assert.equal(page.results[0]?.delivery_type, 'share')
      assert.equal(page.results[0]?.entity_id, firstResult!.entity_id)
      assert.notEqual(page.results[0]?.id, firstResult!.id)
      assert.equal(page.page_info.has_next_page, true)
      assert.ok(page.page_info.end_cursor)
      assert.notEqual(page.page_info.end_cursor, after)
    },
    undefined,
    'getPostFeedIds',
  )
}
