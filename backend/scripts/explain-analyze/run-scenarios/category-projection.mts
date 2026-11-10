import { v7 as uuidv7 } from 'uuid'
import { reconcileRssFeedItemCategorySnapshots } from '@services/rss-feed-items/category-snapshot-reconciliations'
import { CATEGORY_PROJECTION_SCENARIO_IDS } from '../category-projection-scenario-ids.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { HOSTNAME_COUNT, RSS_FEED_SEED_COUNT } from '../seed-data/common.mts'
import {
  prepareCategoryProjection,
  seedCategoryProjection,
  CATEGORY_PROJECTION_NOISE_ROWS,
} from '../seed-data/category-projection.mts'

const cases = [
  ['claimCategoryProjectionResults', 'insert'],
  ['claimCategoryProjectionResults', 'replace'],
  ['isPendingCategorySnapshotCurrent', 'completed'],
  ['getRssFeedItemCategorySnapshots', 'completed'],
  ['completeCategoryProjectionResults', 'completed'],
  ['acknowledgeRssFeedItemCategorySnapshot', 'completed'],
] as const

export async function runCategoryProjectionScenarios(): Promise<void> {
  const itemId = await seedCategoryProjection()
  for (const [index, [queryName, state]] of cases.entries()) {
    const id = CATEGORY_PROJECTION_SCENARIO_IDS[index]!
    const sourceUnion = queryName === 'getRssFeedItemCategorySnapshots'
    const fixtureSourceCount = Math.ceil(RSS_FEED_SEED_COUNT / HOSTNAME_COUNT)
    const resultWrite = queryName === 'completeCategoryProjectionResults'
    const acknowledgement = queryName === 'acknowledgeRssFeedItemCategorySnapshot'
    registerScenarioContract(id, {
      // Each new write/check addresses one item PK. The source union reads one source row
      // on green main; the snapshot and feed caps stay at the seeded fan-in.
      expectations: [
        ...(sourceUnion
          ? ['rss_feed_item_source_category_snapshots', 'rss_feed_item_sources', 'rss_feeds'].map(
              relation => ({
                kind: 'maxProcessedRows' as const,
                relation,
                // Green main reads one source row. The other two relations keep the fixture cap.
                max: relation === 'rss_feed_item_sources' ? 1 : fixtureSourceCount,
              }),
            )
          : [
              {
                kind: 'maxProcessedRows' as const,
                relation: 'rss_feed_item_category_projection_results',
                // A point UPDATE returns the same row its index scan visited.
                max: resultWrite ? 2 : 1,
              },
              {
                kind: 'maxProcessedRows' as const,
                relation: 'rss_feed_item_category_snapshot_reconciliations',
                max: acknowledgement ? 2 : 1,
              },
            ]),
        ...(sourceUnion ? [{ kind: 'noSeqScan' as const, relation: 'rss_feed_item_sources' }] : []),
        {
          kind: 'usesIndexes',
          indexes: sourceUnion
            ? ['idx_rss_feed_item_source_category_snapshots__item_feed']
            : [
                queryName === 'isPendingCategorySnapshotCurrent' || acknowledgement
                  ? 'rss_feed_item_category_snapshot_reconciliations_pkey'
                  : 'rss_feed_item_category_projection_results_pkey',
              ],
          noSort: !sourceUnion,
        },
      ],
      forbidSequentialScans: [
        'rss_feed_item_category_projection_results',
        'rss_feed_item_category_snapshot_reconciliations',
        'rss_feed_item_source_category_snapshots',
        'rss_feed_item_sources',
      ],
      seededRows: {
        rss_feed_item_category_projection_results: CATEGORY_PROJECTION_NOISE_ROWS,
        rss_feed_item_category_snapshot_reconciliations: CATEGORY_PROJECTION_NOISE_ROWS,
        rss_feed_item_source_category_snapshots: CATEGORY_PROJECTION_NOISE_ROWS,
        rss_feed_item_sources: CATEGORY_PROJECTION_NOISE_ROWS,
      },
    })
    let changeId = ''
    // no-mistakes-disable-next-line query-reached-per-item: fixed EXPLAIN cases must restore and capture independent plans serially.
    await runAndCapture(
      id,
      async () => {
        changeId = uuidv7()
        await prepareCategoryProjection(itemId, changeId, state === 'insert' ? 'insert' : 'replace')
        const result = await reconcileRssFeedItemCategorySnapshots(1, [itemId])
        if (result.reconciled !== 1) throw new Error('Expected exactly one category projection')
      },
      undefined,
      queryName,
      { afterCapture: () => prepareCategoryProjection(itemId, changeId, state) },
    )
  }
}
