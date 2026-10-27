/* v8 ignore start -- declarative schema-test allowlist has no executable branches */
export const RSS_CATEGORY_SNAPSHOT_UUID_COLUMNS_WITHOUT_KEYS = [
  [
    'rss_feed_item_category_snapshot_reconciliations.change_id',
    'Opaque notification change token with no owning entity row; stable across replay and fresh for each desired snapshot.',
  ],
] as const satisfies readonly (readonly [string, string])[]
/* v8 ignore stop */
