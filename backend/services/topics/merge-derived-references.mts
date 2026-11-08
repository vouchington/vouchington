// Ordered derived tables. The static inventory check imports this list without
// opening the PostgreSQL pool that the delete helper uses.
export const derivedReferences = [
  ['topic_metrics', 'topic_id'],
  ['bedrock_embedding_batch_entities', 'topic_id'],
  ['classifier_run_candidates', 'topic_id'],
  ['topic_classifier_results', 'topic_id'],
  ['autotagger_agent_run_topics', 'topic_id'],
] as const

// These rows remain until the owning subtype is deleted, then its FK cascades them.
// Deleting them in the earlier derived-reference stage could hide a still-live merge source.
export const cascadedDerivedReferences = [
  ['referral_program_link_counts', 'topic_id', 'referral_program_topics'],
] as const
