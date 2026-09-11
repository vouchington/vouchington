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

export const POST_MODERATION_TABLES_WITHOUT_UPDATED_AT = new Map<string, string>([
  [
    'post_moderation_attempts',
    'Attempt lifecycle mutations are represented by completed_at or failed_at; a generic updated_at would duplicate state.',
  ],
  [
    'post_moderation_dispositions',
    'Append-only disposition ledger; rows never update after insertion.',
  ],
  [
    'post_moderation_versions',
    'Immutable content-and-policy versions; rows never update after insertion.',
  ],
  [
    'post_moderation_work_items',
    'Work lifecycle mutations are represented by available_at, leased_at, lease_expires_at, and completed_at.',
  ],
])

/* v8 ignore stop */
