/* v8 ignore start -- declarative schema-test allowlist */
export const TOPIC_ALIAS_CURSOR_UUID_COLUMNS_WITHOUT_KEYS = [
  [
    'topic_alias_category_mapping_reconciliations.cursor_category_identity_id',
    'Raw category tie-breaker can outlive the swept category identity; it is not a relationship.',
  ],
  [
    'topic_alias_category_mapping_reconciliations.cursor_feed_id',
    'Raw feed keyset position can outlive the swept feed; it is not a relationship.',
  ],
  [
    'topic_alias_category_mapping_reconciliations.cursor_item_id',
    'Raw item keyset position can outlive the swept item; it is not a relationship.',
  ],
  [
    'topic_alias_category_mapping_reconciliations.sweep_upper_bound_feed_id',
    'Frozen feed sweep end can outlive its source row; it is not a relationship.',
  ],
  [
    'topic_alias_category_mapping_reconciliations.sweep_upper_bound_item_id',
    'Frozen item sweep end can outlive its source row; it is not a relationship.',
  ],
] as const satisfies readonly (readonly [string, string])[]
/* v8 ignore stop */
