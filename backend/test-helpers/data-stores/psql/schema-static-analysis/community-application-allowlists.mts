/* v8 ignore start -- declarative schema-test allowlists have no executable branches */
export const COMMUNITY_APPLICATION_MISSING_UPDATED_AT = new Map<string, string>([
  [
    'community_application_answers',
    'Answer rows are inserted once with the application and are not updated in place.',
  ],
  [
    'post_admission_quota_consumptions',
    'Immutable committed-admission quota ledger; rows are inserted once and only later deleted with their reservation or by retention pruning.',
  ],
])
/* v8 ignore stop */
