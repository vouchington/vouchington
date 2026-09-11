export type ModInternalThread = {
  id: string
  channel_type: 'mod_internal'
  community_id: string
  moderation_report_id: string | null
  post_id: string | null
  created_by_id: string | null
  created_at: Date
  updated_at: Date
  resolved_at: Date | null
  resolved_by_id: string | null
}
