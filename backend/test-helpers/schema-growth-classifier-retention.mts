type ClassifierRetentionPolicy = {
  minimumDays: number
  owner: 'data-retention' | 'operator-partition-drop'
  reason: string
}

/** Parent receipts retire after named ranges or bounded DEFAULT pages release their references. */
export const CLASSIFIER_RETENTION_POLICIES = new Map<string, ClassifierRetentionPolicy>([
  [
    'classifier_decision_batches',
    {
      minimumDays: 90,
      owner: 'data-retention',
      reason:
        'Daily capped cleanup deletes old batches after named result ranges or bounded DEFAULT result pages, then candidate snapshots and calls, are gone.',
    },
  ],
  [
    'classifier_decision_calls',
    {
      minimumDays: 90,
      owner: 'data-retention',
      reason:
        'Daily capped cleanup deletes old calls after result rows and candidate snapshots are gone.',
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
        'Daily capped cleanup removes old batch candidate snapshots after result references are retired, even while call receipts remain.',
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
        'UUIDv7 batch ranges start in DEFAULT; bounded cleanup prunes expired DEFAULT rows, while the operator retires complete named ranges outside the retention window.',
    },
  ]),
])
