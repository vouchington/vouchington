import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

const defaultFields = {
  primary_refresh_batch_size: 1000,
}

/** Hard ceilings for the current runtime configuration contract. */
export const electionsVotesWorkMaxValues = {
  primary_refresh_batch_size: 10000,
}

export const electionsVotesWorkConfig = new DynamicConfig({
  key: 'elections-votes-work-config',
  fieldTypes: {
    primary_refresh_batch_size: 'number',
  },
  defaultFields,
})

export function getElectionsVotesWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(electionsVotesWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: electionsVotesWorkMaxValues[field],
  })
}
