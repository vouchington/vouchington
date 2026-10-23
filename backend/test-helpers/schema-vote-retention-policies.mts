/* v8 ignore start -- exact schema contracts and their reviewed rationales */
export const VOTE_RETENTION_BOUNDED_TABLES = new Map<string, string>([
  [
    'vote_ballot_cleanup_cursors',
    'One persisted scan position per ballot family in the fixed vote_ballot_cleanup_families enum.',
  ],
  [
    'user_agent_string_cleanup_cursors',
    'Checked singleton primary key permits only one cyclic orphan sweep position.',
  ],
  [
    'vote_integrity_flag_detail_cleanup_cursors',
    'Checked singleton primary key permits only one cyclic identifying-detail sweep position.',
  ],
])

export const VOTE_RETENTION_UUID_COLUMNS_WITHOUT_KEYS = new Map<string, string>([
  [
    'vote_ballot_cleanup_cursors.cursor_vote_id',
    'UUIDv7 keyset position survives deletion of its scanned ballot; it is not a relationship.',
  ],
  [
    'user_agent_string_cleanup_cursors.cursor_user_agent_string_id',
    'UUIDv7 keyset position survives deletion of its scanned user-agent row; it is not a relationship.',
  ],
  [
    'vote_integrity_flag_detail_cleanup_cursors.cursor_flag_id',
    'UUIDv7 keyset position survives deletion of its scanned moderation flag; it is not a relationship.',
  ],
])
