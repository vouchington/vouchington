import type * as Deps from './dependencies.mts'

type ElectionVote = Deps.ElectionVote
type PublicUser = Deps.PublicUser
type PageInfo = Deps.PageInfo
type Community = Deps.Community
type CommunityMember = Deps.CommunityMember
type CommunityMetrics = Deps.CommunityMetrics
type CommunityApplicationQuestion = Deps.CommunityApplicationQuestion
type CommunityApplication = Deps.CommunityApplication
type CommunityInvite = Deps.CommunityInvite

// Re-export for convenience
export type { ElectionVote }

export type { UserPrivacyAudience, UserPrivacySettings } from '@services/users/types'

export type CommunitiesSearchResult = {
  __entity_type: 'community'
  id: string
}

export type CommunitiesSearchResponseBody = {
  results: CommunitiesSearchResult[]
  page_info: PageInfo
  communities: Record<string, Community>
}

export type CommunityResponseBody = {
  community: Community
  community_metrics?: CommunityMetrics
  membership?: CommunityMember | null
}

export type CommunityMembersResponseBody = {
  results: Array<{ __entity_type: 'community_member'; id: string }>
  page_info: PageInfo
  community_members: Record<string, CommunityMember>
  users: Record<string, PublicUser>
}

export type CommunityPostsResponseBody = {
  results: Array<{ __entity_type: 'post'; id: string }>
  page_info: PageInfo
  posts: Record<string, import('@services/posts/types').Post>
  posts_metrics: Record<string, import('@services/posts/types').PostMetrics>
}

export type CommunityApplicationsResponseBody = {
  results: Array<{ __entity_type: 'community_application'; id: string }>
  page_info: PageInfo
  community_applications: Record<string, CommunityApplication>
}

export type CommunityApplicationQuestionsResponseBody = {
  questions: CommunityApplicationQuestion[]
}

export type CommunityInvitesResponseBody = {
  results: Array<{ __entity_type: 'community_invite'; id: string }>
  page_info: PageInfo
  community_invites: Record<string, CommunityInvite>
}
