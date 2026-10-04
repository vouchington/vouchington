import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

const defaultFields = {
  friend_mutation_batch_size: 1000,
}

/** Hard ceilings for the current runtime configuration contract. */
export const oauthXWorkMaxValues = {
  friend_mutation_batch_size: 10000,
}

export const oauthXWorkConfig = new DynamicConfig({
  key: 'oauth-x-work-config',
  fieldTypes: {
    friend_mutation_batch_size: 'number',
  },
  defaultFields,
})

export function getOauthXWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(oauthXWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: oauthXWorkMaxValues[field],
  })
}
