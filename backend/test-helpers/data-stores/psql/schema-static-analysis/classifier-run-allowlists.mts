/* v8 ignore start -- declarative schema-test allowlists have no executable branches */
export const CLASSIFIER_RUN_TABLES_WITHOUT_CREATED_AT = new Map<string, string>([
  [
    'classifier_run_candidates',
    'Insert-only child of classifier_runs captured with the run at reservation; its timing is the run lifecycle.',
  ],
  [
    'autotagger_agent_run_topics',
    'Insert-only child of classifier_runs written with the run outcome; its timing is the run lifecycle.',
  ],
  [
    'post_classifier_local_outcomes',
    'Insert-only 1:1 child of classifier_runs keyed by run_id; the outcome is written during the run and its timing is the run lifecycle.',
  ],
])

export const CLASSIFIER_RETENTION_UUID_COLUMNS_WITHOUT_KEYS = new Map<string, string>([
  [
    'classifier_retention_cursors.cursor_id',
    'Deletion-stable classifier retention keyset position, not a relationship.',
  ],
  [
    'classifier_retention_cursors.cursor_child_id',
    'Deletion-stable classifier child keyset position, not a relationship.',
  ],
  [
    'classifier_retention_cursors.cursor_classifier_id',
    'Deletion-stable versioned identity sweep scope, never used as classifier authority.',
  ],
  [
    'classifier_retention_cursors.cursor_prompt_version_id',
    'Deletion-stable prompt-version sweep scope, never used as a live relation.',
  ],
  [
    'classifier_retention_cursors.sweep_start_key',
    'Fixed inclusive UUIDv7 keyset lower bound survives deletion of scanned identities.',
  ],
  [
    'classifier_retention_cursors.sweep_end_key',
    'Fixed UUIDv7 sweep boundary survives deletion of scanned rows; not a relationship.',
  ],
])
/* v8 ignore stop */
