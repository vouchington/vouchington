import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = {
  bloom_batch_size: 5000,
  bloom_lookup_batch_size: 5000,
  set_bookmark_max_targets: 500,
}

/** Hard ceilings for the current runtime configuration contract. */
export const bookmarksWorkMaxValues = {
  bloom_batch_size: 50000,
  bloom_lookup_batch_size: 50000,
  set_bookmark_max_targets: 500,
}

export const bookmarksWorkConfig = new DynamicConfig({
  key: 'bookmarks-work-config',
  fieldTypes: {
    bloom_batch_size: 'number',
    bloom_lookup_batch_size: 'number',
    set_bookmark_max_targets: 'number',
  },
  defaultFields,
})

export function getBookmarksWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(bookmarksWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: bookmarksWorkMaxValues[field],
  })
}
