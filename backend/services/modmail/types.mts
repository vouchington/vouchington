export interface ModmailThread {
  id: string
  channel_type: 'modmail'
  title: string
  community_id: string
  subject_user_id: string
  assigned_mod_id: string | null
  assigned_at: Date | null
  resolved_at: Date | null
  resolved_by_id: string | null
  created_by_id: string | null
  created_at: Date
  updated_at: Date
}

export interface CommunitySavedReply {
  id: string
  community_id: string
  title: string
  body: string
  order_index: number
  created_by_id: string | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}
