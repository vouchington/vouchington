import type * as Api from './shared'
import type { CommunityBanEvasionContext } from './community-moderation'

type PageInfo = Api.PageInfo

export interface CommunityModerationQueueEntry {
  id: string
  community_id?: string
  created_at: string
  action_at?: string
  cursor_created_at?: string | null
  cursor_report_count?: number | null
  cursor_severity_rank?: number | null
  entity_type: 'rss_feed_item' | 'post' | 'comment' | 'user' | 'url_hostname'
  entity_id: string
  queue_source: 'report' | 'community_review' | 'automod_flag'
  flagged_reason?: string | null
  post_id?: string | null
  admin_action_path?: string | null
  created_by_id?: string | null
  reason: string | null
  report_count: number
  reporter_user_id?: string | null
  reporter_username?: string | null
  resolved_by_id: string | null
  status: 'pending' | 'reviewed' | 'actioned' | 'dismissed'
  target_available: boolean | null
  target_is_anonymous?: boolean
  target_is_restricted?: boolean
  target_label: string
  target_content: import('@/lib/api/client/reports-contracts').ModerationReportTargetContent | null
  target_path: string | null
  target_user_id: string | null
  judgement: Record<string, unknown> | null
  note?: string | null
  post_moderation_context: Record<string, unknown> | null
  community_ban_evasion: CommunityBanEvasionContext | null
  is_system_generated: boolean
}

export interface CommunityModerationQueueResponseBody {
  entries: CommunityModerationQueueEntry[]
  page_info: PageInfo
  viewer_tier: 'member' | 'moderator'
}
