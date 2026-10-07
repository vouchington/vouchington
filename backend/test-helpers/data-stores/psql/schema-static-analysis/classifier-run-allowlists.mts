/* v8 ignore start -- declarative schema-test allowlists have no executable branches */
export const CLASSIFIER_RUN_TABLES_WITHOUT_CREATED_AT = new Map<string, string>([
  [
    'classifier_run_candidates',
    'Insert-only child of classifier_runs captured with the run at reservation; its timing is the run lifecycle.',
  ],
  [
    'post_classifier_local_outcomes',
    'Insert-only 1:1 child of classifier_runs keyed by run_id; the outcome is written during the run and its timing is the run lifecycle.',
  ],
])
/* v8 ignore stop */
