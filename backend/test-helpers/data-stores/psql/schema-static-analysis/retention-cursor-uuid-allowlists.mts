/* v8 ignore start -- declarative schema-test allowlists have no executable branches */
export const RETENTION_CURSOR_UUID_COLUMNS_WITHOUT_KEYS = [
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
    'notification_email_retention_cleanup_cursors.cursor_user_id',
    'Persisted notification partition-key tie-breaker survives user deletion; it is not a relationship.',
  ],
] as const satisfies readonly (readonly [string, string])[]
/* v8 ignore stop */
