/* v8 ignore start -- declarative schema-test allowlists have no executable branches */
export const COMMUNITY_APPLICATION_MISSING_UPDATED_AT = new Map<string, string>([
  [
    'community_application_answer_selections',
    'Ordered option selections for one answer; rows are inserted with the application and removed only by cascade.',
  ],
  [
    'community_application_answers',
    'Typed application answers are inserted once with the application and are not updated in place.',
  ],
  [
    'community_application_question_options',
    'Option labels are replaced by soft-delete; created_at comes from the option id and rows are not otherwise updated.',
  ],
  [
    'post_admission_quota_consumptions',
    'Immutable committed-admission quota ledger; rows are inserted once and only later deleted by retention pruning.',
  ],
])
/* v8 ignore stop */
