import type * as Api from './shared'

type PublicUser = Api.PublicUser
type Serialized<T> = Api.Serialized<T>
type CommunityApplicationQuestion = Omit<
  Serialized<Api.BackendCommunityApplicationQuestion>,
  '__entity_type' | 'deleted_at'
> & {
  __entity_type?: 'community_application_question'
  deleted_at?: string | null
}
type CommunityApplication = Serialized<Api.BackendCommunityApplication>
type CommunityApplicationSummary = Serialized<Api.BackendCommunityApplicationSummary>
type CommunityInvite = Serialized<Api.BackendCommunityInvite>
type PageInfo = Api.PageInfo

export interface CommunityApplicationsResponseBody {
  results: Array<{ __entity_type: 'community_application_summary'; id: string }>
  page_info: PageInfo
  community_application_summaries: Record<string, CommunityApplicationSummary>
  users: Record<string, PublicUser>
}

export interface CommunityApplicationResponseBody {
  community_application: CommunityApplication
}

export interface CommunityApplicationQuestionsResponseBody {
  questions: CommunityApplicationQuestion[]
}

export interface CommunityInvitesResponseBody {
  results: Array<{ __entity_type: 'community_invite'; id: string }>
  page_info: PageInfo
  community_invites: Record<string, CommunityInvite>
}
