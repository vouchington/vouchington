export interface DirectConversation {
  id: string
  channel_type: 'direct_message'
  title: string
  created_at: string
  updated_at: string
  participant_usernames?: string[]
  participants?: DirectMessageParticipant[]
  created_by_id?: string | null
  participant_add_policy?: 'owner_only' | 'all_members'
}

export interface DirectMessage {
  id: string
  conversation_id: string
  body_text: string
  created_by_id: string | null
  sender_username?: string | null
  created_at: string
}

export interface DirectMessageParticipant {
  id: string
  conversation_id: string
  user_id: string | null
  role: 'owner' | 'member' | 'admin'
  created_at: string
  username?: string | null
  profile_image_id?: string | null
  profile_image_placement?: import('./user').ImagePlacementTuple | null
}

export interface DirectConversationsResponse {
  results: DirectConversation[]
  page_info: { has_next_page: boolean; end_cursor: string | null }
}

export interface DirectMessagesResponse {
  results: DirectMessage[]
  page_info: { has_next_page: boolean; end_cursor: string | null }
}
