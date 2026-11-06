/* v8 ignore start -- declarative schema-test allowlist has no executable branches */
export const OPERATIONAL_CURSOR_UUID_COLUMNS_WITHOUT_KEYS = [
  [
    'rss_feed_item_candidate_reconciliations.cursor_feed_id',
    'Last scanned source key can outlive removal of that source; it is compared as a cursor, never joined.',
  ],
  [
    'rss_feed_item_candidate_reconciliations.cursor_topic_id',
    'Last scanned topic key can outlive removal of that topic; it is compared as a cursor, never joined.',
  ],
  ['images.deletion_post_cursor', 'Post scan position survives deletion; never joined.'],
  [
    'retained_identity_cleanup_cursors.cursor_identity_id',
    'Operational keyset scan position can outlive its prior root row; it is not a relationship.',
  ],
] as const satisfies readonly (readonly [string, string])[]
/* v8 ignore stop */
