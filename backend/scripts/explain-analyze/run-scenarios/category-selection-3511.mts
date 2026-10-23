import { read } from '@data-stores/psql'
import { buildTopicAliasCategoryMappingDirtyRowsQuery } from '@services/rss-feeds/reconcile-topic-alias-category-mappings'
import {
  getRssFeedItemCategorySnapshots,
  listRssFeedItemCategorySnapshotReconciliations,
} from '@services/rss-feed-items/category-snapshot-reconciliations'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

export async function runCategorySelection3511Scenarios(): Promise<void> {
  registerScenarioContract('alias-category-dirty-page', {
    seededRows: { topic_alias_category_mapping_reconciliations: 10000 },
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_topic_alias_category_mapping_reconciliations__updated_at'],
      },
      {
        kind: 'maxProcessedRows',
        relation: 'topic_alias_category_mapping_reconciliations',
        max: 30,
      },
    ],
  })
  await runAndCapture('alias-category-dirty-page', async () => {
    const { rows } = await read(buildTopicAliasCategoryMappingDirtyRowsQuery(25))
    if (rows.length !== 25) throw new Error('Expected full alias category dirty page')
  })

  registerScenarioContract('rss-item-category-dirty-page', {
    seededRows: { rss_feed_item_category_snapshot_reconciliations: 10000 },
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_rss_feed_item_category_snapshot_reconciliations__updated_at'],
      },
      {
        kind: 'maxProcessedRows',
        relation: 'rss_feed_item_category_snapshot_reconciliations',
        max: 30,
      },
    ],
  })
  await runAndCapture('rss-item-category-dirty-page', async () => {
    const rows = await listRssFeedItemCategorySnapshotReconciliations(25)
    if (rows.length !== 25) throw new Error('Expected full item category dirty page')
  })

  registerScenarioContract('rss-item-category-source-fanin', {
    seededRows: { rss_feed_item_source_category_snapshots: 10000 },
    expectations: [],
  })
  await runAndCapture(
    'rss-item-category-source-fanin',
    async () => {
      const rows = await listRssFeedItemCategorySnapshotReconciliations(25)
      const snapshots = await getRssFeedItemCategorySnapshots(rows.map(row => row.rss_feed_item_id))
      if (snapshots.size === 0) throw new Error('Expected source category fan-in')
    },
    undefined,
    'getRssFeedItemCategorySnapshots',
  )
}
