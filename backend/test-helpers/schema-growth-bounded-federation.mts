/** Bounded federation storage whose row counts are checked by the schema growth suite. */
export const FEDERATION_BOUNDED_TABLES: [string, string][] = [
  [
    'activitypub_inbox_activities',
    'Signed request age bounds replay admission; a capped keyset sweep removes older inbox dedup rows.',
  ],
  [
    'activitypub_distribution_work_items',
    'UUIDv7 activity age bounds distribution replay; a capped keyset sweep removes old completed checkpoints.',
  ],
  [
    'activitypub_replay_retention_cursors',
    'At most one persisted high-water key per inbox or outbound replay ledger.',
  ],
  [
    'follower_distributions',
    'A bounded daily UUIDv7 retention sweep deletes terminal intents after seven days; active intents remain work.',
  ],
  [
    'follower_distribution_deliveries',
    'Delivery identities cascade with bounded terminal follower distributions.',
  ],
  [
    'follower_distribution_selected_recipients',
    'Recipient snapshots cascade with bounded terminal follower distributions.',
  ],
  [
    'follower_distribution_retention_cursors',
    'One singleton cursor retains the bounded terminal follower-distribution sweep position.',
  ],
]
