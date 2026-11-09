/* v8 ignore start -- declarative schema-test allowlist has no executable branches */
export const OPERATIONAL_CURSOR_UUID_COLUMNS_WITHOUT_KEYS = [
  [
    'oauth_friend_reference_repair_cursors.cursor_edge_id',
    'Committed traversal position survives erasure of the scanned provider edge; never joined.',
  ],
  [
    'oauth_friend_reference_repair_cursors.cursor_upper_edge_id',
    'Fixed UUIDv7 sweep end survives edge erasure and is only compared as a bound.',
  ],
  ['images.deletion_post_cursor', 'Post scan position survives deletion; never joined.'],
  [
    'retained_identity_cleanup_cursors.cursor_identity_id',
    'Operational keyset scan position can outlive its prior root row; it is not a relationship.',
  ],
] as const satisfies readonly (readonly [string, string])[]
/* v8 ignore stop */
