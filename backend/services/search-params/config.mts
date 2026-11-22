import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export const searchParamsMaxValues = { max_topic_search_terms: 5 } as const

export const searchParamsConfig = new DynamicConfig({
  key: 'search-params-config',
  fieldTypes: { max_topic_search_terms: 'number' },
  defaultFields: searchParamsMaxValues,
})

export function getTopicSearchTermLimit(): number {
  return getBoundedPositiveIntegerField(searchParamsConfig, 'max_topic_search_terms', {
    defaultValue: searchParamsMaxValues.max_topic_search_terms,
    maxValue: searchParamsMaxValues.max_topic_search_terms,
  })
}
