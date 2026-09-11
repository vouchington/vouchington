export type CommunityMemberVacation = {
  community_id: string
  user_id: string
  starts_at: Date
  ends_at: Date | null
  created_at: Date
  updated_at: Date
}

export type CommunityMemberVacationSettings = {
  vacation: CommunityMemberVacation | null
  suppress_community_digests_while_on_vacation: boolean
}
