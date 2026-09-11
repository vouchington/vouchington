export type Conversation = {
  id: string
  channel_type: string
  title: string
  created_at: Date
  created_by_id: string | null
  updated_at: Date
  updated_by_id: string | null
  deleted_at: Date | null
  deleted_by_id: string | null
  last_response_id: string | null
}
