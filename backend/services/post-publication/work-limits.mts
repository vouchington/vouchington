import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = {
  capture_batch_size: 500,
  effect_payload_key_batch_size: 1000,
  story_lifecycle_lock_batch_size: 500,
  rss_feed_hard_delete_capture_batch_size: 500,
  topic_alias_unlink_page_size: 100,
  topic_alias_unlink_page_concurrency: 1,
  topic_alias_unlink_recovery_concurrency: 1,
}

/** Hard ceilings for the current runtime configuration contract. */
export const postPublicationWorkMaxValues = {
  capture_batch_size: 5000,
  effect_payload_key_batch_size: 5000,
  story_lifecycle_lock_batch_size: 5000,
  rss_feed_hard_delete_capture_batch_size: 5000,
  topic_alias_unlink_page_size: 1000,
  topic_alias_unlink_page_concurrency: 8,
  topic_alias_unlink_recovery_concurrency: 4,
}

export const postPublicationWorkConfig = new DynamicConfig({
  key: 'post-publication-work-config',
  fieldTypes: {
    capture_batch_size: 'number',
    effect_payload_key_batch_size: 'number',
    story_lifecycle_lock_batch_size: 'number',
    rss_feed_hard_delete_capture_batch_size: 'number',
    topic_alias_unlink_page_size: 'number',
    topic_alias_unlink_page_concurrency: 'number',
    topic_alias_unlink_recovery_concurrency: 'number',
  },
  defaultFields,
})

export function getPostPublicationWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(postPublicationWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: postPublicationWorkMaxValues[field],
  })
}
