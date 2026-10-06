export type CommunityBanEvasionFlag = {
  community_id: string
  user_id: string
  suspected_ban_evader_at: Date
  suspected_ban_evader_source_user_id: string | null
  suspected_ban_evader_score: number | null
  suspected_ban_evader_dismissed_at: Date | null
  suspected_ban_evader_dismissed_by_id: string | null
}
