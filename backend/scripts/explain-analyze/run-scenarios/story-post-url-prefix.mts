import assert from 'node:assert/strict'
import { beginTransaction } from '@data-stores/psql'
import { getStoryPostRelatedUrlProjectionPrefix } from '@services/stories/story-post-related-url-projection'
import { pruneStoryPostRelatedUrlsOutsidePrefix } from '@services/stories/story-post-related-url-projection-prune'
import { lockStoryPostRelatedUrlProjectionHostnameBlocks } from '@services/stories/story-post-related-url-projection-relation-safety'
import type { ProjectionWork } from '@services/stories/story-post-related-url-projection-types'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { RSS_FEED_ITEM_SEED_COUNT } from '../seed-data/common.mts'
import { POST_URL_CAPACITY_SEED as seed } from '../seed-data/post-related-url-capacity.mts'
import {
  activeUrlIds,
  attachPrefixItems,
  DEFAULT_LEASE,
  HIGH_WATER_ID,
  ITEM_INDEX,
  leasePruneJobs,
  MAXIMUM_LEASE,
  partitionIndexNames,
  prefixUrlIds,
  PRUNE_INDEX,
  restorePrefixItems,
  STORY_ID,
} from './story-post-url-prefix-setup.mts'

/** Admission, prefix hostname locks, and the post-bounded prune at both relation caps. */
export async function captureStoryPostUrlPrefixScenarios(): Promise<void> {
  const [itemIndexes, pruneIndexes] = await Promise.all([
    partitionIndexNames(ITEM_INDEX),
    partitionIndexNames(PRUNE_INDEX),
  ])
  try {
    await attachPrefixItems()
    await leasePruneJobs()
    await captureAdmission('story-post-related-url-admission-prefix-default', 1000, itemIndexes)
    await captureAdmission('story-post-related-url-admission-prefix-maximum', 10_000, itemIndexes)
    await captureHostLocks('story-post-related-url-prefix-host-locks-default', 1000)
    await captureHostLocks('story-post-related-url-prefix-host-locks-maximum', 10_000)
    await capturePrune(
      'story-post-related-url-prune-default',
      1000,
      seed.posts[0]!,
      DEFAULT_LEASE,
      pruneIndexes,
    )
    await capturePrune(
      'story-post-related-url-prune-maximum',
      10_000,
      seed.posts[1]!,
      MAXIMUM_LEASE,
      pruneIndexes,
    )
  } finally {
    await restorePrefixItems()
  }
}

async function captureAdmission(
  id: string,
  cap: number,
  itemIndexes: readonly string[],
): Promise<void> {
  registerScenarioContract(id, {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: itemIndexes,
        anyOf: true,
        noSort: true,
        queryContains: 'getStoryPostRelatedUrlProjectionPrefix',
      },
      { kind: 'maxProcessedRows', relation: 'rss_feed_items', max: cap },
      { kind: 'maxProcessedRows', relation: 'urls', max: cap },
    ],
    forbidSequentialScans: ['rss_feed_items', 'urls'],
    seededRows: { rss_feed_items: RSS_FEED_ITEM_SEED_COUNT },
    crossPartition: {
      rss_feed_items:
        'Story membership can attach items whose ids predate the story, so the prefix can read every item partition.',
    },
  })
  await runAndCapture(
    id,
    async () => {
      const rows = await getStoryPostRelatedUrlProjectionPrefix({
        storyId: STORY_ID,
        sourceHighWaterId: HIGH_WATER_ID,
        limit: cap,
      })
      assert.equal(rows.length, cap)
    },
    undefined,
    'getStoryPostRelatedUrlProjectionPrefix',
  )
}

async function captureHostLocks(id: string, cap: number): Promise<void> {
  const urlIds = await prefixUrlIds(cap)
  registerScenarioContract(id, {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'urls', max: cap },
      { kind: 'maxProcessedRows', relation: 'url_hostnames', max: cap * 5 },
    ],
    forbidSequentialScans: ['urls', 'url_hostnames'],
  })
  await using query = await beginTransaction()
  await runAndCapture(
    id,
    () => lockStoryPostRelatedUrlProjectionHostnameBlocks(query, urlIds),
    undefined,
    'lockStoryPostRelatedUrlProjectionHostnameBlocks',
  )
  await query.rollback()
}

async function capturePrune(
  id: string,
  cap: number,
  postId: string,
  leaseToken: string,
  pruneIndexes: readonly string[],
): Promise<void> {
  const admittedUrlIds = await activeUrlIds(postId)
  assert.equal(admittedUrlIds.length, cap)
  registerScenarioContract(id, {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: pruneIndexes,
        anyOf: true,
        queryContains: 'pruneStoryPostRelatedUrlsOutsidePrefix',
      },
      { kind: 'maxProcessedRows', relation: 'relation__post__related__url', max: cap },
    ],
    forbidSequentialScans: ['relation__post__related__url'],
    seededRows: { relation__post__related__url: seed.relationRows },
  })
  await using query = await beginTransaction()
  await runAndCapture(
    id,
    () =>
      pruneStoryPostRelatedUrlsOutsidePrefix(
        query,
        pruneWork(postId, leaseToken),
        seed.user,
        admittedUrlIds,
      ),
    undefined,
    'pruneStoryPostRelatedUrlsOutsidePrefix',
  )
  await query.rollback()
}

function pruneWork(postId: string, leaseToken: string): ProjectionWork {
  return {
    post_id: postId,
    story_id: STORY_ID,
    generation: '1',
    sweep_upper_bound_source_id: null,
    source_completed_at: null,
    lease_token: leaseToken,
  }
}
