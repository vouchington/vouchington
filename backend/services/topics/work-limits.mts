import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

const defaultFields = {
  alias_post_invalidation_batch_size: 100,
}

/** Hard ceilings for the current runtime configuration contract. */
export const topicsWorkMaxValues = {
  alias_post_invalidation_batch_size: 1000,
}

export const topicsWorkConfig = new DynamicConfig({
  key: 'topics-work-config',
  fieldTypes: {
    alias_post_invalidation_batch_size: 'number',
  },
  defaultFields,
})

export function getTopicsWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(topicsWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: topicsWorkMaxValues[field],
  })
}
