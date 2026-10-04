import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

const defaultFields = {
  alias_resolution_batch_size: 1000,
  rss_feed_publisher_batch_size: 500,
}

/** Hard ceilings for the current runtime configuration contract. */
export const entityRelationsWorkMaxValues = {
  alias_resolution_batch_size: 10000,
  rss_feed_publisher_batch_size: 5000,
}

export const entityRelationsWorkConfig = new DynamicConfig({
  key: 'entity-relations-work-config',
  fieldTypes: {
    alias_resolution_batch_size: 'number',
    rss_feed_publisher_batch_size: 'number',
  },
  defaultFields,
})

export function getEntityRelationsWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(entityRelationsWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: entityRelationsWorkMaxValues[field],
  })
}
