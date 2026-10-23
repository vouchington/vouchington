/* v8 ignore start -- declarative schema-test allowlists have no executable branches */
export const NOTIFICATION_PUSH_RETENTION_UUID_COLUMNS_WITHOUT_KEYS = [
  [
    'notification_push_intent_retention_cursors.cursor_notification_push_intent_id',
    'Operational UUIDv7 keyset position survives deletion of the scanned push intent; it is not a relationship.',
  ],
  [
    'notification_push_intent_retention_cursors.sweep_upper_bound_notification_push_intent_id',
    'Frozen UUIDv7 age bound for the current sweep; it does not identify a persisted push intent.',
  ],
] as const satisfies readonly (readonly [string, string])[]
/* v8 ignore stop */
