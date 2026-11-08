import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = {
  friend_mutation_batch_size: 100,
  max_provider_pages_per_run: 25,
  max_finalize_batches_per_run: 20,
}

/** Hard ceilings for the current runtime configuration contract. */
export const oauthFacebookWorkMaxValues = {
  friend_mutation_batch_size: 256,
  max_provider_pages_per_run: 100,
  max_finalize_batches_per_run: 100,
}

export const oauthFacebookWorkConfig = new DynamicConfig({
  key: 'oauth-facebook-work-config',
  fieldTypes: {
    friend_mutation_batch_size: 'number',
    max_provider_pages_per_run: 'number',
    max_finalize_batches_per_run: 'number',
  },
  defaultFields,
})

export function getOauthFacebookWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(oauthFacebookWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: oauthFacebookWorkMaxValues[field],
  })
}
