/** Persisted scan positions survive deletion of the row they last examined. */
export const AI_RETENTION_UUID_COLUMNS_WITHOUT_KEYS = new Map<string, string>([
  [
    'ai_agent_receipt_retention_cursors.cursor_receipt_id',
    'Last scanned UUIDv7 receipt, which may already have been retired; not a live row relation.',
  ],
  [
    'ai_agent_receipt_retention_cursors.sweep_upper_bound_receipt_id',
    'Frozen UUIDv7 scan boundary, not a live row relation.',
  ],
  [
    'ai_usage_response_key_retention_cursors.cursor_id',
    'Last scanned UUIDv7 provider key, which may already have been deleted; not a live row relation.',
  ],
  [
    'ai_usage_response_key_retention_cursors.sweep_upper_bound_id',
    'Frozen UUIDv7 provider-key scan boundary, not a live row relation.',
  ],
  [
    'bedrock_embedding_batch_retention_cursors.cursor_batch_id',
    'Last scanned UUIDv7 batch, which may already have been deleted; not a live row relation.',
  ],
  [
    'media_delivery_change_retention_cursors.cursor_id',
    'Last scanned UUIDv7 transition, which may already have been deleted; not a live row relation.',
  ],
  [
    'media_delivery_change_retention_cursors.sweep_upper_bound_id',
    'Frozen UUIDv7 transition scan boundary, not a live row relation.',
  ],
  [
    'post_moderation_work_retention_cursors.cursor_version_id',
    'Last scanned UUIDv7 work version, which may already have been deleted; not a live row relation.',
  ],
])
