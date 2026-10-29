import { beginTransaction } from '@data-stores/psql'
import { readAliasCategoryRawPage } from '@services/rss-feeds/topic-alias-category-raw-page'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

export async function runTopicAliasRawPageScenarios(aliasId: string): Promise<void> {
  await captureRawPhase(
    aliasId,
    0,
    'readAliasCategoryRawPage authoredItems',
    'idx_rss_feed_item_categories__topic_alias_id',
  )
  await captureRawPhase(
    aliasId,
    1,
    'readAliasCategoryRawPage textItems',
    'idx_rss_feed_item_categories__category_identity_id',
  )
  await captureRawPhase(
    aliasId,
    2,
    'readAliasCategoryRawPage textFeeds',
    'idx_rss_feed_categories__category_identity_id',
  )
}

async function captureRawPhase(
  aliasId: string,
  phase: 0 | 1 | 2,
  queryName: string,
  indexName: string,
): Promise<void> {
  const emptyCursor = {
    scan_upper_item_id: null,
    scan_upper_feed_id: null,
    after_item_id: null,
    after_category_identity_id: null,
    after_feed_id: null,
  }
  const label = `topic-alias-raw-phase-${phase}`
  registerScenarioContract(label, {
    expectations: [
      { kind: 'usesIndexes', indexes: [indexName] },
      {
        kind: 'maxProcessedRows',
        relation: phase === 2 ? 'rss_feed_categories' : 'rss_feed_item_categories',
        max: 150,
      },
    ],
    seededRows: { rss_feed_item_categories: 6_000, rss_feed_categories: 22_000 },
  })
  await runAndCapture(
    label,
    async () => {
      await using transaction = await beginTransaction()
      const page = await readAliasCategoryRawPage(
        transaction,
        aliasId,
        'seed-alias-0',
        { ...emptyCursor, phase },
        100,
      )
      if (page.rows.length !== 100 || !page.hasMore)
        throw new Error(`${label} needs a full raw page with continuation`)
      await transaction.commit()
      return page
    },
    undefined,
    queryName,
  )
}
