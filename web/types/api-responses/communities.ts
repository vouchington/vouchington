/* oxlint-disable max-lines -- community API response contracts stay colocated for cross-fixture exactness checks */
import type * as Api from './shared'
import type { PublicUrl } from './urls-onboarding-and-trends'
import type { UrlEmbed } from './posts-topics-and-feeds'
import type { CommunityBanEvasionContext } from './community-moderation'

type Post = Api.Post
type PostMetrics = Api.PostMetrics
type Hostname = Api.Hostname
type Topic = Api.Topic
type TopicMetrics = Api.TopicMetrics
type PublicUser = Api.PublicUser
type ViewRssFeed = Api.ViewRssFeed
type Serialized<T> = Api.Serialized<T>
export type CommunityRelationItem = Serialized<Api.BackendCommunity>
type Community = CommunityRelationItem
type CommunityMember = Serialized<Api.BackendCommunityMember>
type CommunityMetrics = Serialized<Api.BackendCommunityMetrics>
type CommunityApplicationQuestion = Omit<
  Serialized<Api.BackendCommunityApplicationQuestion>,
  '__entity_type' | 'deleted_at'
> & {
  __entity_type?: 'community_application_question'
  deleted_at?: string | null
}
type CommunityApplication = Serialized<Api.BackendCommunityApplication>
type CommunityInvite = Serialized<Api.BackendCommunityInvite>
type CommunityListItem = Serialized<Api.BackendCommunityListItem>
type PageInfo = Api.PageInfo

// Community response body types
export interface CommunitiesSearchResult {
  __entity_type: 'community'
  id: string
}

export interface CommunityOwner {
  id: string
  username: string | null
}

export interface CommunitiesSearchResponseBody {
  results: CommunitiesSearchResult[]
  page_info: PageInfo
  communities: Record<string, Community>
  users: Record<string, CommunityOwner>
  community_metrics: Record<string, CommunityMetrics>
  community_memberships?: Record<string, CommunityMember>
  pending_application_community_ids?: string[]
  bookmarks?: Record<string, Record<string, boolean>>
}

export interface CommunityResponseBody {
  community: Community
  user: CommunityOwner | null
  community_metrics: CommunityMetrics | null
  membership?: CommunityMember | null
  has_pending_application?: boolean
}

export interface CommunityArchiveResponseBody {
  community: Community
}

export interface CommunityPostTypeSettingsResponseBody {
  community: Community
}

export interface CommunityMembersResponseBody {
  results: Array<{ __entity_type: 'community_member'; id: string }>
  page_info: PageInfo
  community_members: Record<string, CommunityMember>
  users: Record<string, PublicUser>
}

export interface CommunityPostsResponseBody {
  results: Array<{ __entity_type: 'post'; id: string }>
  page_info: PageInfo
  posts: Record<string, Post>
  posts_metrics: Record<string, PostMetrics>
  pinned_post_ids?: string[]
  communities?: Record<string, Pick<Community, 'id' | 'name' | 'slug'>>
  post_link_embeds?: Record<string, UrlEmbed>
}

export type {
  CommunityBanEvasionContext,
  CommunityMemberVacation,
  CommunityModerationReport,
  CommunityModerationReportsResponseBody,
  CommunityModeratorStatEntry,
  CommunityModeratorStatsResponseBody,
  ModeratorVacationResponseBody,
  ModeratorVacationDigestPreferenceResponseBody,
} from './community-moderation'

export interface CommunityAiAgentEntitlement {
  allowed: boolean
  reason: string | null
}

export interface CommunityAiAgent {
  slug: string
  agent_id: string
  system_user_id: string
  system_username: string
  label_topic_slugs: string[]
  on_flag_action: 'none' | 'review_queue'
  enabled: boolean
  always_on: boolean
  enabled_at: string | null
  enabled_by_id: string | null
  entitlement: CommunityAiAgentEntitlement
}

export interface CommunityAiAgentsResponseBody {
  community_ai_agents: CommunityAiAgent[]
}

export interface CommunityAiAgentResponseBody {
  community_ai_agent: CommunityAiAgent
}

export interface CommunityAgentPrompt {
  id: string
  community_id: string
  created_by_id: string
  agent_id: string
  prompt: string
  model_name: string
  model_provider: string
  slot_allocated: boolean
  on_flag_action: 'none' | 'unpublish'
  activated_at: string | null
  deactivated_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  deleted_by_id: string | null
}

export interface CommunityAgentPromptsResponseBody {
  community_agent_prompts: CommunityAgentPrompt[]
  slot_info: {
    used: number
    limit: number
    remaining: number
    limits_by_plan: Record<string, number>
  }
}

export interface CommunityModmailThread {
  id: string
  channel_type: string
  title: string
  community_id: string
  subject_user_id: string | null
  assigned_mod_id: string | null
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

export interface CommunityPinnedPostsResponseBody {
  pinned_posts: Array<{
    community_id: string
    created_at: string
    order_index: number
    pinned_by_id: string
    post_id: string
  }>
}

export interface CommunityApplicationsResponseBody {
  results: Array<{ __entity_type: 'community_application'; id: string }>
  page_info: PageInfo
  community_applications: Record<string, CommunityApplication>
}

export interface CommunityApplicationQuestionsResponseBody {
  questions: CommunityApplicationQuestion[]
}

export interface CommunityInvitesResponseBody {
  results: Array<{ __entity_type: 'community_invite'; id: string }>
  page_info: PageInfo
  community_invites: Record<string, CommunityInvite>
}

interface CommunityListItemResult {
  __entity_type: 'community_list_item'
  id: string
}

export interface CommunityListTopicsResponseBody {
  results: CommunityListItemResult[]
  page_info: PageInfo
  community_list_items: Record<string, CommunityListItem>
  topics: Record<string, Topic>
  topics_metrics: Record<string, TopicMetrics>
}

export interface CommunityListRssFeedsResponseBody {
  results: CommunityListItemResult[]
  page_info: PageInfo
  community_list_items: Record<string, CommunityListItem>
  rss_feeds: Record<string, ViewRssFeed>
}

export interface CommunityListPostsResponseBody {
  results: CommunityListItemResult[]
  page_info: PageInfo
  community_list_items: Record<string, CommunityListItem>
  posts: Record<string, Post>
  posts_metrics: Record<string, PostMetrics>
}

export interface CommunityListDomainsResponseBody {
  results: CommunityListItemResult[]
  page_info: PageInfo
  community_list_items: Record<string, CommunityListItem>
  url_hostnames: Record<string, Hostname>
}

export interface CommunityListUrlsResponseBody {
  results: CommunityListItemResult[]
  page_info: PageInfo
  community_list_items: Record<string, CommunityListItem>
  urls: Record<string, PublicUrl>
}

export interface CommunityListItemCountsResponseBody {
  topic: number
  rss_feed: number
  post: number
  url_hostname: number
  url: number
}

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
  queue_source: 'report' | 'community_review'
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
  target_label: string | null
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

/**
 * Merged type for all community list page responses — used by client components
 * that need to accumulate pages across all entity types (e.g. usePaginatedList).
 */
export interface CommunityListPageData {
  page_info: PageInfo
  results: CommunityListItemResult[]
  community_list_items: Record<string, CommunityListItem>
  topics?: Record<string, Topic>
  topics_metrics?: Record<string, TopicMetrics>
  rss_feeds?: Record<string, ViewRssFeed>
  posts?: Record<string, Post>
  posts_metrics?: Record<string, PostMetrics>
  url_hostnames?: Record<string, Hostname>
  urls?: Record<string, PublicUrl>
}

export interface MyCommunityMembershipsResponseBody {
  results: CommunityMember[]
  page_info: PageInfo
}
