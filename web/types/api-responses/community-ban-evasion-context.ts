export interface CommunityBanEvasionContext {
  community_id: string
  community_slug: string
  source_user_id?: string
  source_username?: string | null
  score?: number
  flagged_at?: string
}
