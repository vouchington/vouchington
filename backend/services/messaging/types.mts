export interface DirectConversation {
  id: string
  channel_type: 'direct_message'
  title: string
  created_at: Date
  created_by_id: string | null
  updated_at: Date
  participant_usernames?: string[]
  participant_add_policy?: 'owner_only' | 'all_members'
}

export interface ConversationParticipant {
  id: string
  conversation_id: string
  user_id: string | null
  role: 'owner' | 'admin' | 'member'
  created_at: Date
  removed_at: Date | null
  username: string | null
  profile_image_id: string | null
}

export interface DirectMessage {
  id: string
  conversation_id: string
  body_text: string
  created_by_id: string | null
  sender_username?: string | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}
