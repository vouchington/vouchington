export interface UserModNote {
  id: string
  created_at: Date
  target_user_id: string
  author_user_id: string
  author_username: string | null
  author_display_name: string | null
  community_id: string | null
  community_name: string | null
  body: string
  deleted_at: Date | null
}
