// Ordered derived tables. The static inventory check imports this list without
// opening the PostgreSQL pool that the delete helper uses.
export const derivedReferences = [
  ['topic_metrics', 'topic_id'],
  ['bedrock_embedding_batch_entities', 'topic_id'],
  ['classifier_run_candidates', 'topic_id'],
  ['topic_classifier_results', 'topic_id'],
  ['autotagger_agent_run_topics', 'topic_id'],
] as const
