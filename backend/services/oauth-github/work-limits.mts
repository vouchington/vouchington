import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

const defaultFields = {
  friend_mutation_batch_size: 1000,
}

/** Hard ceilings for the current runtime configuration contract. */
export const oauthGithubWorkMaxValues = {
  friend_mutation_batch_size: 10000,
}

export const oauthGithubWorkConfig = new DynamicConfig({
  key: 'oauth-github-work-config',
  fieldTypes: {
    friend_mutation_batch_size: 'number',
  },
  defaultFields,
})

export function getOauthGithubWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(oauthGithubWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: oauthGithubWorkMaxValues[field],
  })
}
