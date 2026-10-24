type ClassifierRetentionPolicy = {
  minimumDays: number
  owner: 'data-retention' | 'operator-partition-drop'
  reason: string
}

/** Parent receipts are reclaimed after their operator-owned result partitions have been removed. */
export const CLASSIFIER_RETENTION_POLICIES = new Map<string, ClassifierRetentionPolicy>([
  [
    'classifier_decision_batches',
    {
      minimumDays: 90,
      owner: 'data-retention',
      reason:
        'Daily capped cleanup deletes old batches only after operator-owned result partitions and their calls and candidate snapshots are gone.',
    },
  ],
  [
    'classifier_decision_calls',
    {
      minimumDays: 90,
      owner: 'data-retention',
      reason:
        'Daily capped cleanup deletes old calls only after their operator-owned result rows are gone.',
    },
  ],
  [
    'classifier_runs',
    {
      minimumDays: 90,
      owner: 'data-retention',
      reason:
        'Daily capped cleanup expires terminal run payloads after their child rows are removed; compact identities and ledger attribution remain.',
    },
  ],
  [
    'classifier_run_candidates',
    {
      minimumDays: 90,
      owner: 'data-retention',
      reason: 'Daily capped cleanup removes candidates of old runs before deleting their receipts.',
    },
  ],
  [
    'classifier_decision_batch_candidates',
    {
      minimumDays: 90,
      owner: 'data-retention',
      reason:
        'Daily capped cleanup removes old batch candidate snapshots after their result references are retired.',
    },
  ],
  ...['autotagger_agent_run_topics', 'post_classifier_local_outcomes'].map(
    (table): [string, ClassifierRetentionPolicy] => [
      table,
      {
        minimumDays: 90,
        owner: 'data-retention',
        reason: 'Daily capped cleanup removes terminal run children before their run payload.',
      },
    ],
  ),
  ...[
    'topic_classifier_results',
    'story_classifier_results',
    'community_prompt_classifier_results',
  ].map((table): [string, ClassifierRetentionPolicy] => [
    table,
    {
      minimumDays: 90,
      owner: 'operator-partition-drop',
      reason:
        'UUIDv7 batch ranges start in DEFAULT and are split on demand; the owner retires only complete ranges outside the retention window.',
    },
  ]),
])
