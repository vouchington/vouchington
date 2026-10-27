/** Persisted scan positions survive deletion of the row they last examined. */
export const AI_RETENTION_UUID_COLUMNS_WITHOUT_KEYS = new Map<string, string>([
  [
    'media_delivery_change_retention_cursors.cursor_change_id',
    'Last scanned UUIDv7 transition, which may already have been deleted; not a live row relation.',
  ],
  [
    'media_delivery_change_retention_cursors.sweep_upper_bound_change_id',
    'Frozen UUIDv7 transition scan boundary, not a live row relation.',
  ],
])
