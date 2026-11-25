import { v7 as uuidv7 } from 'uuid'
import {
  reconcileRssFeedItemCategorySnapshots,
  reconcileRssFeedItemCategorySourcePage,
} from '@services/rss-feed-items/category-snapshot-reconciliations'
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
  ['getRssFeedItemCategorySnapshotPage', 'completed'],
  ['completeCategoryProjectionResults', 'completed'],
  ['acknowledgeRssFeedItemCategorySnapshot', 'completed'],
] as const

export async function runCategoryProjectionScenarios(): Promise<void> {
  const itemId = await seedCategoryProjection()
  for (const [index, [queryName, state]] of cases.entries()) {
    const id = CATEGORY_PROJECTION_SCENARIO_IDS[index]!
    const sourceUnion = queryName === 'getRssFeedItemCategorySnapshotPage'
    const fixtureSourceCount = Math.ceil(RSS_FEED_SEED_COUNT / HOSTNAME_COUNT)
    const resultWrite = queryName === 'completeCategoryProjectionResults'
    const acknowledgement = queryName === 'acknowledgeRssFeedItemCategorySnapshot'
    registerScenarioContract(id, {
      // Point writes/checks address one item. The source page retains the existing fixture
      // budgets while its ordered source index supplies the runtime page limit.
      expectations: [
        ...(sourceUnion
          ? ['rss_feed_item_source_category_snapshots', 'rss_feeds'].map(relation => ({
              kind: 'maxProcessedRows' as const,
              relation,
              max: fixtureSourceCount,
            }))
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
    await runAndCapture(
      id,
      async () => {
        changeId = uuidv7()
        await prepareCategoryProjection(itemId, changeId, state === 'insert' ? 'insert' : 'replace')
        const selected = await reconcileRssFeedItemCategorySnapshots(1, [itemId])
        const page = selected.sourcePages?.[0]
        if (!page) throw new Error('Expected one selected category snapshot')
        const result = await reconcileRssFeedItemCategorySourcePage(page)
        if (result.reconciled !== 1) throw new Error('Expected exactly one category projection')
      },
      undefined,
      queryName,
      { afterCapture: () => prepareCategoryProjection(itemId, changeId, state) },
    )
  }
}
