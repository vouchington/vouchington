/* v8 ignore start -- declarative schema-test allowlist has no executable branches */
export const RETENTION_CURSOR_UUID_COLUMNS_WITHOUT_KEYS: ReadonlyArray<readonly [string, string]> =
  [
    [
      'retained_identity_cleanup_cursors.cursor_identity_id',
      'Operational keyset scan position can outlive its prior root row; it is not a relationship.',
    ],
    [
      'ai_usage_retention_cursors.cursor_id',
      'Operational raw usage keyset position survives deletion of its scanned record; it is not a relationship.',
    ],
    [
      'ai_usage_retention_cursors.sweep_upper_bound_id',
      'Fixed UUIDv7 sweep boundary is a scan position, not a relationship to a raw usage record.',
    ],
  ]
/* v8 ignore stop */
