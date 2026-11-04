/** List row for application review. The answers and the full message load from the detail route. */
export type CommunityApplicationSummary = {
  __entity_type: 'community_application_summary'
  id: string
  user_id: string
  status: 'pending' | 'approved' | 'rejected'
  message_preview: string | null
  answer_count: number
  created_at: Date
}
