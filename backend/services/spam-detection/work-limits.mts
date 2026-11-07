import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = {
  content_hash_lookback_days: 30,
  embeddings_similarity_lookback_days: 30,
}

/** Hard ceilings: a lookback this long keeps every probe inside a bounded set of post-id partitions. */
export const spamDetectionWorkMaxValues = {
  content_hash_lookback_days: 365,
  embeddings_similarity_lookback_days: 90,
}

export const spamDetectionWorkConfig = new DynamicConfig({
  key: 'spam-detection-work-config',
  fieldTypes: {
    content_hash_lookback_days: 'number',
    embeddings_similarity_lookback_days: 'number',
  },
  defaultFields,
})

export function getSpamDetectionWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(spamDetectionWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: spamDetectionWorkMaxValues[field],
  })
}
