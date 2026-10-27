/* v8 ignore start -- declarative schema-test allowlist has no executable branches */
export const OPERATIONAL_CURSOR_UUID_COLUMNS_WITHOUT_KEYS = [
  ['images.deletion_post_cursor', 'Post scan position survives deletion; never joined.'],
  [
    'retained_identity_cleanup_cursors.cursor_identity_id',
    'Operational keyset scan position can outlive its prior root row; it is not a relationship.',
  ],
] as const satisfies readonly (readonly [string, string])[]
/* v8 ignore stop */
