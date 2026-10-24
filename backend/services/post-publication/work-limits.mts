import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = {
  capture_batch_size: 500,
  dirty_work_key_batch_size: 1000,
  identity_snapshot_page_size: 100,
  reconciliation_page_size: 100,
  raw_candidate_scan_page_size: 500,
  shadow_audit_page_size: 100,
  story_lifecycle_lock_batch_size: 500,
  rss_feed_hard_delete_capture_batch_size: 500,
}

/** Hard ceilings for the current runtime configuration contract. */
export const postPublicationWorkMaxValues = {
  capture_batch_size: 5000,
  dirty_work_key_batch_size: 10000,
  identity_snapshot_page_size: 1000,
  reconciliation_page_size: 1000,
  raw_candidate_scan_page_size: 1000,
  shadow_audit_page_size: 1000,
  story_lifecycle_lock_batch_size: 5000,
  rss_feed_hard_delete_capture_batch_size: 5000,
}

export const postPublicationWorkConfig = new DynamicConfig({
  key: 'post-publication-work-config',
  fieldTypes: {
    capture_batch_size: 'number',
    dirty_work_key_batch_size: 'number',
    identity_snapshot_page_size: 'number',
    reconciliation_page_size: 'number',
    raw_candidate_scan_page_size: 'number',
    shadow_audit_page_size: 'number',
    story_lifecycle_lock_batch_size: 'number',
    rss_feed_hard_delete_capture_batch_size: 'number',
  },
  defaultFields,
})

export function getPostPublicationWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(postPublicationWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: postPublicationWorkMaxValues[field],
  })
}
