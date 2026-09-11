import type * as Api from './shared'
import type { ModeratorActionType } from '@ts-shared/utils/moderation-catalogs'

type ElectionVote = Api.ElectionVote
type Serialized<T> = Api.Serialized<T>
type PublicUser = Api.PublicUser
type BackendCommunity = Api.BackendCommunity
type BackendCommunityMember = Api.BackendCommunityMember
type BackendCommunityMetrics = Api.BackendCommunityMetrics
type BackendCommunityPostReview = Api.BackendCommunityPostReview
type BackendCommunityApplicationQuestion = Api.BackendCommunityApplicationQuestion
type BackendCommunityApplication = Api.BackendCommunityApplication
type BackendCommunityBan = Api.BackendCommunityBan
type BackendCommunityRestriction = Api.BackendCommunityRestriction
type BackendCommunityInvite = Api.BackendCommunityInvite
type BackendCommunityListItem = Api.BackendCommunityListItem
type CommunityVisibility = Api.CommunityVisibility
type CommunityMemberRosterVisibility = Api.CommunityMemberRosterVisibility
type CommunityMemberRole = Api.CommunityMemberRole
type CommunityListType = Api.CommunityListType
type CommunityListItemType = Api.CommunityListItemType
type CommunityRestrictionType = Api.CommunityRestrictionType
type BackendNotification = Api.BackendNotification
type BackendNotificationResult = Api.BackendNotificationResult
type WebPushSubscriptionRecord = Api.WebPushSubscriptionRecord
type PageInfo = Api.PageInfo
type ListResponse<T> = Api.ListResponse<T>
type PaginatedResult<TEntityType extends string = string> = Api.PaginatedResult<TEntityType>

// Re-export pagination types for consumers of this module

export type { PageInfo, ListResponse, PaginatedResult }

// Re-export community visibility enums for consumers

export type {
  CommunityVisibility,
  CommunityMemberRosterVisibility,
  CommunityMemberRole,
  CommunityListType,
  CommunityListItemType,
  CommunityRestrictionType,
}

// Community entity types — derived from canonical backend types via Serialized<T>

export type Community = Serialized<BackendCommunity>

export type CommunityMember = Serialized<BackendCommunityMember>

export type CommunityMetrics = Serialized<BackendCommunityMetrics>

export type CommunityPostReview = Serialized<BackendCommunityPostReview>

export type CommunityApplicationQuestion = Omit<
  Serialized<BackendCommunityApplicationQuestion>,
  '__entity_type' | 'deleted_at'
> & {
  __entity_type?: 'community_application_question'
  deleted_at?: string | null
}

export type CommunityApplication = Serialized<BackendCommunityApplication>

export type CommunityBan = Serialized<BackendCommunityBan>

export interface CommunityBansResponseBody {
  results: Array<{ __entity_type: 'community_ban'; id: string }>
  page_info: PageInfo
  community_bans: Record<string, CommunityBan>
  users: Record<string, PublicUser>
}

export type CommunityRestriction = Serialized<BackendCommunityRestriction>

export interface RaidModeSuggestion {
  velocity_spike: boolean
  flag_count: number
  latest_flagged_at: string | null
}

export interface CommunityRestrictionsResponseBody {
  results: Array<{ __entity_type: 'community_restriction'; id: string }>
  page_info: PageInfo
  community_restrictions: Record<string, CommunityRestriction>
  raid_mode_suggestion: RaidModeSuggestion | null
}

export interface ActivateCommunityRestrictionsResponseBody {
  community_restrictions: Record<string, CommunityRestriction>
}

export type CommunityInvite = Serialized<BackendCommunityInvite>

export type { ModeratorActionType }

export interface ModeratorActionView {
  id: string
  community_id: string | null
  actor_id: string | null
  action_type: ModeratorActionType
  post_id: string | null
  target_user_id: string | null
  report_id: string | null
  review_dispute_id: string | null
  community_application_id: string | null
  reason: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface ModlogResponseBody {
  results: Array<{ __entity_type?: 'moderator_action'; id: string }>
  page_info: PageInfo
  moderator_actions: Record<string, ModeratorActionView>
  users: Record<string, PublicUser>
}

export type CommunityListItem = Serialized<BackendCommunityListItem>

// Notification entity types — derived from canonical backend types via Serialized<T>

export type Notification = Serialized<BackendNotification>

export type NotificationResult = Serialized<BackendNotificationResult>

export type WebPushSubscription = Serialized<WebPushSubscriptionRecord>

/**
 * Base paginated response structure shared by all API endpoints
 */

export interface PaginatedResponse<TResult extends PaginatedResult> {
  results: TResult[]
  page_info: PageInfo
  bookmarks?: Record<string, Record<string, boolean>>
  election_votes?: Record<string, ElectionVote>
}
