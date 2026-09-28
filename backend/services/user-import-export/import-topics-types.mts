export type ImportTopicResult = {
  input: string
  status: 'followed' | 'recommendation_created' | 'already_following' | 'error'
  error?: string
  entity_id?: string
  recommendation_post_id?: string
}
