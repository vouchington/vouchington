export interface UserModNote {
  id: string
  created_at: Date
  target_user_id: string
  author_user_id: string
  community_id: string | null
  body: string
  deleted_at: Date | null
}
