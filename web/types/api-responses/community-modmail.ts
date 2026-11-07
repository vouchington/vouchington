import type * as Api from './shared'

type PageInfo = Api.PageInfo

export interface CommunityModmailThread {
  id: string
  channel_type: string
  title: string
  community_id: string
  subject_user_id: string | null
  assigned_moderator_user_id: string | null
  assigned_at: string | null
  resolved_at: string | null
  resolved_by_id: string | null
  created_by_id: string | null
  created_at: string
  updated_at: string
}

export interface CommunityModmailInboxResponseBody {
  results: CommunityModmailThread[]
  page_info: PageInfo
}
