/**
 * Closed domains for the classifier result tables and in-flight predicates that partition retirement splices into SQL. Each
 * switch returns literals and throws on anything else, so the interpolated text is finite.
 */

export function classifierResultTable(table: string) {
  switch (table) {
    case 'topic_classifier_results':
      return 'topic_classifier_results'
    case 'story_classifier_results':
      return 'story_classifier_results'
    case 'community_prompt_classifier_results':
      return 'community_prompt_classifier_results'
    case 'classifier_decision_batch_candidates':
      return 'classifier_decision_batch_candidates'
    default:
      throw new Error(`Unsupported classifier result table: ${table}`)
  }
}

export function inFlightPredicate(predicate: string) {
  switch (predicate) {
    case 'completed_at IS NULL':
      return 'completed_at IS NULL'
    case 'has_pending_embeddings = TRUE':
      return 'has_pending_embeddings = TRUE'
    case 'bedrock_nova_multimodal_v1_embedding_created_at IS NULL':
      return 'bedrock_nova_multimodal_v1_embedding_created_at IS NULL'
    default:
      throw new Error(`Unsupported in-flight predicate: ${predicate}`)
  }
}
