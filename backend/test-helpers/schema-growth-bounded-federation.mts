/** Bounded federation storage whose row counts are checked by the schema growth suite. */
export const FEDERATION_BOUNDED_TABLES: [string, string][] = [
  [
    'activitypub_inbox_activities',
    'Signed request age bounds replay admission; a capped keyset sweep removes older inbox dedup rows.',
  ],
  [
    'activitypub_replay_rejection_floors',
    'One durable inbound replay rejection boundary survives ledger expiry.',
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
]
