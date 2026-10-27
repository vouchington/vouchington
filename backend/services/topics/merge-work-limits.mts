import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = {
  page_size: 64,
  recovery_stale_seconds: 300,
}

export const topicMergeWorkMaxValues = {
  page_size: 500,
  recovery_stale_seconds: 3600,
}

export const topicMergeWorkConfig = new DynamicConfig({
  key: 'topic-merge-work-config',
  fieldTypes: {
    page_size: 'number',
    recovery_stale_seconds: 'number',
  },
  defaultFields,
})

export function getTopicMergeWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(topicMergeWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: topicMergeWorkMaxValues[field],
  })
}
