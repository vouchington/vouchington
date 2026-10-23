/** UUIDv7 scan positions survive deletion of the row last seen by a retention sweep. */
export const FEDERATION_RETENTION_UUID_COLUMNS_WITHOUT_KEYS: [string, string][] = [
  [
    'follower_distribution_retention_cursors.cursor_distribution_position',
    'Persisted UUIDv7 keyset position may outlive the deleted follower distribution.',
  ],
  [
    'follower_distribution_retention_cursors.sweep_upper_bound_distribution_position',
    'Captured UUIDv7 high-water position may outlive the deleted follower distribution.',
  ],
  [
    'activitypub_replay_retention_cursors.cursor_position',
    'Persisted UUIDv7 ledger keyset position may outlive the deleted inbox or outbound row.',
  ],
  [
    'activitypub_replay_retention_cursors.upper_bound_position',
    'Captured UUIDv7 ledger high-water position may outlive the deleted inbox or outbound row.',
  ],
]
