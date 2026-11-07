import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = {
  friend_mutation_batch_size: 100,
  max_provider_pages_per_run: 25,
  max_finalize_batches_per_run: 20,
}

/** Hard ceilings for the current runtime configuration contract. */
export const oauthXWorkMaxValues = {
  friend_mutation_batch_size: 256,
  max_provider_pages_per_run: 100,
  max_finalize_batches_per_run: 100,
}

export const oauthXWorkConfig = new DynamicConfig({
  key: 'oauth-x-work-config',
  fieldTypes: {
    friend_mutation_batch_size: 'number',
    max_provider_pages_per_run: 'number',
    max_finalize_batches_per_run: 'number',
  },
  defaultFields,
})

export function getOauthXWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(oauthXWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: oauthXWorkMaxValues[field],
  })
}
