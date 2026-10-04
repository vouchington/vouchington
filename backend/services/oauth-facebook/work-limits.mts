import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

const defaultFields = {
  friend_mutation_batch_size: 1000,
}

/** Hard ceilings for the current runtime configuration contract. */
export const oauthFacebookWorkMaxValues = {
  friend_mutation_batch_size: 10000,
}

export const oauthFacebookWorkConfig = new DynamicConfig({
  key: 'oauth-facebook-work-config',
  fieldTypes: {
    friend_mutation_batch_size: 'number',
  },
  defaultFields,
})

export function getOauthFacebookWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(oauthFacebookWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: oauthFacebookWorkMaxValues[field],
  })
}
