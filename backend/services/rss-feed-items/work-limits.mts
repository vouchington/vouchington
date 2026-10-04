import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

const defaultFields = {
  source_publication_backfill_max_batch_size: 1000,
  category_backfill_batch_size: 500,
  backfill_invalidation_chunk_size: 100,
  source_publication_backfill_batch_size: 500,
  category_invalidation_chunk_size: 16,
  category_snapshot_reconciliation_batch_size: 25,
  category_clear_batch_size: 500,
  sql_batch_size: 250,
  category_sql_batch_size: 1000,
  enqueue_batch_size: 1000,
  story_category_item_batch_size: 500,
  story_category_change_batch_size: 1000,
}

/** Hard ceilings for the current runtime configuration contract. */
export const rssFeedItemsWorkMaxValues = {
  source_publication_backfill_max_batch_size: 10000,
  category_backfill_batch_size: 5000,
  backfill_invalidation_chunk_size: 1000,
  source_publication_backfill_batch_size: 1000,
  category_invalidation_chunk_size: 1000,
  category_snapshot_reconciliation_batch_size: 1000,
  category_clear_batch_size: 5000,
  sql_batch_size: 2500,
  category_sql_batch_size: 10000,
  enqueue_batch_size: 10000,
  story_category_item_batch_size: 5000,
  story_category_change_batch_size: 10000,
}

export const rssFeedItemsWorkConfig = new DynamicConfig({
  key: 'rss-feed-items-work-config',
  fieldTypes: {
    source_publication_backfill_max_batch_size: 'number',
    category_backfill_batch_size: 'number',
    backfill_invalidation_chunk_size: 'number',
    source_publication_backfill_batch_size: 'number',
    category_invalidation_chunk_size: 'number',
    category_snapshot_reconciliation_batch_size: 'number',
    category_clear_batch_size: 'number',
    sql_batch_size: 'number',
    category_sql_batch_size: 'number',
    enqueue_batch_size: 'number',
    story_category_item_batch_size: 'number',
    story_category_change_batch_size: 'number',
  },
  defaultFields,
})

export function getRssFeedItemsWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(rssFeedItemsWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: rssFeedItemsWorkMaxValues[field],
  })
}
