/** Deletion-stable UUID keyset positions intentionally outlive the operational rows they scan. */
export const OPERATIONAL_RETENTION_UUID_COLUMNS_WITHOUT_KEYS: [string, string][] = [
  [
    'operational_tombstone_retention_cursors.cursor_id',
    'Deletion-stable UUIDv7 tie-breaker for an operational keyset page, not a relationship.',
  ],
  [
    'payment_operational_cleanup_cursors.cursor_id',
    'Operational keyset position survives deletion of the swept row; it is not a relationship.',
  ],
  [
    'auth_session_retention_cleanup_cursors.cursor_id',
    'Keyset scan position survives deletion of the scanned auth, session, or subscription row.',
  ],
  [
    'auth_session_retention_cleanup_cursors.cursor_partition_key',
    'Subscription partition tie-breaker survives deletion of its user and subscription rows.',
  ],
]
