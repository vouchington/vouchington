import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

const defaultFields = {
  category_sql_batch_size: 500,
  category_backfill_batch_size: 500,
  topic_alias_category_mapping_reconciliation_batch_size: 25,
}

/** Hard ceilings for the current runtime configuration contract. */
export const rssFeedsWorkMaxValues = {
  category_sql_batch_size: 5000,
  category_backfill_batch_size: 5000,
  topic_alias_category_mapping_reconciliation_batch_size: 1000,
}

export const rssFeedsWorkConfig = new DynamicConfig({
  key: 'rss-feeds-work-config',
  fieldTypes: {
    category_sql_batch_size: 'number',
    category_backfill_batch_size: 'number',
    topic_alias_category_mapping_reconciliation_batch_size: 'number',
  },
  defaultFields,
})

export function getRssFeedsWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(rssFeedsWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: rssFeedsWorkMaxValues[field],
  })
}
