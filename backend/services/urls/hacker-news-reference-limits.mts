import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = { stories_per_url: 25, comments_per_url: 25, url_batch_size: 200 }
export const hackerNewsReferenceMaxValues = {
  stories_per_url: 25,
  comments_per_url: 25,
  url_batch_size: 1000,
}

export const hackerNewsReferenceConfig = new DynamicConfig({
  key: 'hacker-news-reference-config',
  fieldTypes: { stories_per_url: 'number', comments_per_url: 'number', url_batch_size: 'number' },
  defaultFields,
})

export function getHackerNewsReferenceLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(hackerNewsReferenceConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: hackerNewsReferenceMaxValues[field],
  })
}
