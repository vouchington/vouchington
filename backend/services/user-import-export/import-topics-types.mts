export type ImportTopicResult = {
  input: string
  status: 'followed' | 'recommendation_created' | 'already_following' | 'skipped' | 'error'
  error_code?: 'RELATION_LIMIT_REACHED'
  error?: string
  entity_id?: string
  recommendation_post_id?: string
}
