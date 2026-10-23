import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = {
  friend_mutation_batch_size: 100,
}

/** Hard ceilings for the current runtime configuration contract. */
export const oauthGithubWorkMaxValues = {
  friend_mutation_batch_size: 256,
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
