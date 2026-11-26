import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import {
  postPublicationWorkConfig,
  postPublicationWorkMaxValues,
} from '@services/post-publication/work-limits'
import { hardDeleteRssFeedSourcePage } from '@services/rss-feeds/hard-delete-source-page'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { runRssHardDeleteCrawlCapacityScenario } from './rss-hard-delete-crawl-capacity.mts'
import {
  cleanupRssHardDeleteSourceCapacity,
  restoreRssHardDeleteSourceCapacity,
  seedRssHardDeleteSourceCapacity,
} from './rss-hard-delete-source-capacity-fixture.mts'

const markers = [
  'hardDeleteRssFeedSourcePage:candidates',
  'hardDeleteRssFeedSourcePage:lockSources',
  'hardDeleteRssFeedSourcePage:deleteSources',
  'hardDeleteRssFeedSourcePage:storyPosts',
] as const

export async function runRssHardDeleteSourceCapacityScenario(): Promise<void> {
  const scenario = 'rss-hard-delete-sources-at-cap'
  const limit = postPublicationWorkMaxValues.rss_feed_hard_delete_capture_batch_size
  const fixture = await seedRssHardDeleteSourceCapacity(limit)
  const restoreWorkLimit = overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, {
    rss_feed_hard_delete_capture_batch_size: limit,
  })
  const first = fixture.targetIds.slice(0, limit)
  const last = fixture.targetIds.at(-1)!
  const postKey = { kind: 'impact_post', uuidValue: fixture.post_id }

  try {
    const { rows } = await write<{ story_posts: number }>(
      '/* countRssHardDeleteSourceCapacityStoryPosts */ SELECT COUNT(*)::int AS story_posts FROM story_posts',
    )
    registerScenarioContract(scenario, {
      // The DELETE statement has no RETURNING clause.
      allowEmptyResult: true,
      seededRows: { story_posts: rows[0]!.story_posts },
      expectations: [
        { kind: 'maxProcessedRows', relation: 'rss_feed_item_sources', max: limit + 1 },
      ],
    })
    await runAndCapture(
      scenario,
      async () => {
        const page = await hardDeleteRssFeedSourcePage(fixture.target.id, first[0]!)
        assert.deepEqual(page, {
          removed: limit,
          hasMore: true,
          keys: [...first.map(uuidValue => ({ kind: 'impact_rss_feed_item', uuidValue })), postKey],
        })
      },
      undefined,
      markers,
      {
        exactCapturedNames: [
          'hardDeleteRssFeedSourcePage:feed',
          'enqueueNextHardDeleteRssFeedPages',
          markers[0],
          markers[1],
          'markRssFeedItemCategorySnapshotsForReconciliation',
          markers[2],
          markers[3],
        ],
        afterCapture: async () => {
          assert.deepEqual(await remainingSourceIds(fixture.target.id), [last])
          assert.deepEqual(await remainingSourceIds(fixture.other.id), fixture.otherIds)
          const continuation = await hardDeleteRssFeedSourcePage(fixture.target.id, last)
          assert.deepEqual(continuation, {
            removed: 1,
            hasMore: false,
            keys: [{ kind: 'impact_rss_feed_item', uuidValue: last }, postKey],
          })
          assert.deepEqual(await remainingSourceIds(fixture.target.id), [])
          assert.deepEqual(await remainingSourceIds(fixture.other.id), fixture.otherIds)
          const { rows: linked } = await write<{ id: string }>(
            `/* checkRssHardDeleteSourceCapacityStory */
             SELECT item.id FROM story_posts
             JOIN rss_feed_items item ON item.story_id = story_posts.story_id
             WHERE story_posts.post_id = $1 AND item.id = ANY($2::uuid[]) ORDER BY item.id`,
            [fixture.post_id, [first[0]!, last]],
          )
          assert.deepEqual(
            linked.map(row => row.id),
            [first[0]!, last],
          )
          // Each EXPLAIN starts with all target edges present and rolls back its mutation.
          await restoreRssHardDeleteSourceCapacity(fixture)
        },
      },
    )
  } finally {
    restoreWorkLimit()
    await cleanupRssHardDeleteSourceCapacity(fixture)
  }
  await runRssHardDeleteCrawlCapacityScenario()
}

async function remainingSourceIds(feedId: string): Promise<string[]> {
  const { rows } = await write<{ rss_feed_item_id: string; categories: string[] | null }>(
    `/* checkRssHardDeleteSourceCapacitySurvivors */
     SELECT source.rss_feed_item_id, snapshot.categories FROM rss_feed_item_sources source
     LEFT JOIN rss_feed_item_source_category_snapshots snapshot USING (rss_feed_id, rss_feed_item_id)
     WHERE source.rss_feed_id = $1 ORDER BY source.rss_feed_item_id`,
    [feedId],
  )
  assert.ok(rows.every(row => row.categories?.[0] === 'rss hard-delete category'))
  return rows.map(row => row.rss_feed_item_id)
}
