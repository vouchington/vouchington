/* v8 ignore start -- declarative schema-test allowlists have no executable branches */
export const POST_MODERATION_TABLES_WITHOUT_CREATED_AT = new Map<string, string>([
  [
    'post_moderation_dispositions',
    'Append-only disposition ledger; decided_at is the semantic creation timestamp derived from its UUIDv7 id.',
  ],
  [
    'post_moderation_work_items',
    'Composite-key work projection whose lifecycle is represented by available, leased, lease-expiry, and completed timestamps.',
  ],
])

/* v8 ignore stop */
