// Reviewed storage-column contracts for the prelaunch finite-value conversion.
export const FINITE_COLUMN_CONTRACTS_7 = [
  ['review_disputes', 'resolution_action', 'review_dispute_actions', false],
  ['story_classifier_results', 'candidate_kind', 'classifier_candidate_kinds', false],
  ['story_classifier_results', 'scope_category', 'classifier_scope_categories', false],
  ['topic_classifier_results', 'candidate_kind', 'classifier_candidate_kinds', false],
  ['topic_classifier_results', 'scope_category', 'classifier_scope_categories', false],
  ['topic_revisions', 'revision_type', 'revision_types', false],
  ['url_hostname_blocks', 'blocked_source', 'url_hostname_block_sources', false],
  ['user_deletion_external_works', 'work_kind', 'user_deletion_external_work_kinds', false],
  ['user_deletion_requests', 'current_phase', 'user_deletion_request_current_phases', false],
  ['user_import_requests', 'entity_type', 'import_entity_types', false],
  ['users', 'community_digest_frequency', 'digest_frequencies', false],
  ['users', 'default_post_privacy', 'privacy_types', false],
  ['users', 'news_digest_frequency', 'digest_frequencies', false],
  ['users', 'use_display_name_from', 'user_display_name_sources', false],
] as const
