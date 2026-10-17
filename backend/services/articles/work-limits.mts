import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = {
  sync_batch_size: 50,
}

/** Maximum article bodies and prefetched lookup results retained for one sync batch. */
export const articlesWorkMaxValues = {
  sync_batch_size: 100,
}

export const articlesWorkConfig = new DynamicConfig({
  key: 'articles-work-config',
  fieldTypes: { sync_batch_size: 'number' },
  defaultFields,
})

export function getArticleSyncBatchSize(): number {
  return getBoundedPositiveIntegerField(articlesWorkConfig, 'sync_batch_size', {
    defaultValue: defaultFields.sync_batch_size,
    maxValue: articlesWorkMaxValues.sync_batch_size,
  })
}
