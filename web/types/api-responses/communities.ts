import type { AccountType } from '@ts-shared/utils/account-type'
import type { HackerNewsReferenceCounts } from '@/types/hacker-news'
import type * as Api from './shared'
import type { UrlEmbed } from './posts-topics-and-feeds'

type Post = Api.Post
type PostMetrics = Api.PostMetrics
type PublicUser = Api.PublicUser
type Serialized<T> = Api.Serialized<T>
export type CommunityRelationItem = Serialized<Api.BackendCommunity>
type Community = CommunityRelationItem
type CommunityMember = Serialized<Api.BackendCommunityMember>
type CommunityMetrics = Serialized<Api.BackendCommunityMetrics>
type PageInfo = Api.PageInfo

// Community response body types
interface CommunitiesSearchResult {
  __entity_type: 'community'
  id: string
}

interface CommunityOwner {
  account_type: AccountType
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

export interface CommunityAutomodSettingsResponseBody {
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
  post_hacker_news_references?: Record<string, HackerNewsReferenceCounts>
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

interface CommunityAiAgentEntitlement {
  allowed: boolean
  reason: string | null
}

export interface CommunityAiAgent {
  slug: string
  agent_id: string
  system_user_id: string
  system_username: string
  label_topic_slugs: string[]
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
  is_slot_allocated: boolean
  activated_at: string | null
  deactivated_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  deleted_by_id: string | null
}

export interface CommunityAgentPromptsResponseBody {
  community_agent_prompts: CommunityAgentPrompt[]
  page_info: Api.PageInfo
  slot_info: {
    used: number
    limit: number
    remaining: number
    limits_by_plan: Record<string, number>
  }
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

export interface MyCommunityMembershipsResponseBody {
  results: CommunityMember[]
  page_info: PageInfo
}
