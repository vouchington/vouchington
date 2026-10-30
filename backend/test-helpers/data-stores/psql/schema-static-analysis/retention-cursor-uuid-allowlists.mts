/* v8 ignore start -- declarative schema-test allowlists have no executable branches */
export const RETENTION_CURSOR_UUID_COLUMNS_WITHOUT_KEYS = [
  [
    'import_retention_cursors.cursor_row_id',
    'Deletion-stable import row keyset position survives the swept row; it is not a relationship.',
  ],
  [
    'import_retention_cursors.cursor_discovery_url_id',
    'Deletion-stable discovery keyset position survives the swept discovery; it is not a relationship.',
  ],
  [
    'user_data_request_attempt_retention_cursors.cursor_request_id',
    'Composite attempt keyset position survives request deletion; it is not a relationship.',
  ],
  [
    'user_data_request_attempt_retention_cursors.cursor_processing_attempt_id',
    'Composite attempt keyset tie-breaker survives deletion of the swept attempt; it is not a relationship.',
  ],
  [
    'user_data_request_attempt_retention_cursors.cursor_upper_id',
    'Frozen request UUIDv7 sweep boundary survives request deletion; it is not a relationship.',
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
    'retained_identity_cleanup_cursors.cursor_identity_id',
    'Operational keyset scan position can outlive its prior root row; it is not a relationship.',
  ],
  [
    'retained_image_placement_binding_cleanup_cursors.cursor_placement_id',
    'Operational placement UUIDv7 position survives deletion of the swept binding; it is not a relationship.',
  ],
  [
    'retained_relation_identity_cleanup_cursors.cursor_subject_id',
    'Operational composite keyset scan position can outlive its prior owner; it is not a relationship.',
  ],
  [
    'retained_relation_identity_cleanup_cursors.cursor_relation_id',
    'Operational composite keyset scan position can outlive its prior owner; it is not a relationship.',
  ],
  [
    'notification_email_retention_cleanup_cursors.cursor_notification_id',
    'Persisted UUIDv7 keyset position survives deletion of the swept row; it is not a relationship.',
  ],
  [
    'notification_email_retention_cleanup_cursors.cursor_notification_partition_id',
    'Persisted notification partition-key tie-breaker survives user deletion; it is not a relationship.',
  ],
  [
    'ai_usage_retention_cursors.cursor_id',
    'Operational raw usage keyset position survives deletion of its scanned record; it is not a relationship.',
  ],
  [
    'ai_usage_retention_cursors.sweep_upper_bound_id',
    'Fixed UUIDv7 sweep boundary is a scan position, not a relationship to a raw usage record.',
  ],
] as const satisfies readonly (readonly [string, string])[]
/* v8 ignore stop */
