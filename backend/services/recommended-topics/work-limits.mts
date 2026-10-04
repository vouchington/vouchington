import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

const defaultFields = {
  candidate_page_size: 1000,
}

/** Hard ceilings for the current runtime configuration contract. */
export const recommendedTopicsWorkMaxValues = {
  candidate_page_size: 10000,
}

export const recommendedTopicsWorkConfig = new DynamicConfig({
  key: 'recommended-topics-work-config',
  fieldTypes: {
    candidate_page_size: 'number',
  },
  defaultFields,
})

export function getRecommendedTopicsWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(recommendedTopicsWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: recommendedTopicsWorkMaxValues[field],
  })
}
