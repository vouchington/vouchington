'use client'
import { clientApi } from './instance'
import { searchMyCommunities } from './community-search'
import type {
  Community,
  CommunityResponseBody,
  CommunityInvite,
  CommunityVisibility,
  CommunityMemberRosterVisibility,
  CommunityListType,
  CommunityMemberRole,
  CommunityPinnedPostsResponseBody,
  CommunityPostTypeSettingsResponseBody,
} from '@/types/api-responses'
export { banMember, liftBan, fetchCommunityBans } from './community-bans'
export {
  activateCommunityRestrictions,
  fetchCommunityRestrictions,
  liftCommunityRestriction,
} from './community-restrictions'
export { fetchCommunities, searchMyCommunities } from './community-search'
export { archiveCommunity, unarchiveCommunity } from './community-archive'
export {
  addCommunityListItemByType,
  addCommunityListDomain,
  addCommunityListPost,
  addCommunityListRssFeed,
  addCommunityListTopic,
  addCommunityListUrl,
  removeCommunityListItem,
} from './community-list-items'

interface CreateCommunityInput {
  name: string
  slug?: string
  markdown?: string
  visibility?: CommunityVisibility
  list_type?: CommunityListType | null
  member_roster_visibility?: CommunityMemberRosterVisibility
  post_approval_required_at?: boolean
  allow_review_posts?: boolean
  allow_data_point_posts?: boolean
  member_invites_allowed_at?: boolean
  cf_turnstile_response?: string
}
type UpdateCommunityInput = Partial<CreateCommunityInput> & {
  profile_image_id?: string | null
  banner_image_id?: string | null
}
export function createCommunity(input: CreateCommunityInput): Promise<CommunityResponseBody> {
  return clientApi.post<CommunityResponseBody>('/api/v1/communities', input)
}
export function updateCommunity(
  idOrSlug: string,
  input: UpdateCommunityInput,
): Promise<CommunityResponseBody> {
  return clientApi.patch<CommunityResponseBody>(`/api/v1/communities/${idOrSlug}`, input)
}
export function updateCommunityPostTypeSettings(
  idOrSlug: string,
  input: { allow_review_posts?: boolean; allow_data_point_posts?: boolean },
): Promise<CommunityPostTypeSettingsResponseBody> {
  return clientApi.patch<CommunityPostTypeSettingsResponseBody>(
    `/api/v1/communities/${idOrSlug}/post-type-settings`,
    input,
  )
}
export function deleteCommunity(idOrSlug: string): Promise<void> {
  return clientApi.delete(`/api/v1/communities/${idOrSlug}`)
}
export function joinCommunity(idOrSlug: string): Promise<void> {
  return clientApi.post(`/api/v1/communities/${idOrSlug}/members`)
}
export function leaveCommunity(idOrSlug: string): Promise<void> {
  return clientApi.delete(`/api/v1/communities/${idOrSlug}/members`)
}
export function updateMemberRole(
  idOrSlug: string,
  userId: string,
  role: CommunityMemberRole,
): Promise<void> {
  return clientApi.patch(`/api/v1/communities/${idOrSlug}/members/${userId}`, { role })
}
export function removeMember(idOrSlug: string, userId: string): Promise<void> {
  return clientApi.delete(`/api/v1/communities/${idOrSlug}/members/${userId}`)
}
export function applyToCommunity(
  idOrSlug: string,
  answers: Record<string, unknown>,
  message?: string,
): Promise<void> {
  return clientApi.post(`/api/v1/communities/${idOrSlug}/applications`, {
    answers,
    ...(message ? { message } : {}),
  })
}
export function approveApplication(idOrSlug: string, applicationId: string): Promise<void> {
  return clientApi.patch(`/api/v1/communities/${idOrSlug}/applications/${applicationId}`, {
    status: 'approved',
  })
}
export function rejectApplication(
  idOrSlug: string,
  applicationId: string,
  rejectionReason: string,
): Promise<void> {
  return clientApi.patch(`/api/v1/communities/${idOrSlug}/applications/${applicationId}`, {
    status: 'rejected',
    reason: rejectionReason,
  })
}
export function approvePost(idOrSlug: string, postId: string): Promise<void> {
  return clientApi.patch(`/api/v1/communities/${idOrSlug}/posts/${postId}`, { status: 'approved' })
}
export function rejectPost(
  idOrSlug: string,
  postId: string,
  rejectionReason: string,
): Promise<void> {
  return clientApi.patch(`/api/v1/communities/${idOrSlug}/posts/${postId}`, {
    status: 'rejected',
    reason: rejectionReason,
  })
}
export function unpublishCommunityPost(idOrSlug: string, postId: string): Promise<void> {
  return clientApi.patch(`/api/v1/communities/${idOrSlug}/posts/${postId}`, {
    status: 'unpublished',
    reason_code: 'staff_unpublished',
  })
}

export function sendInvite(
  idOrSlug: string,
  input: { email?: string; username?: string },
): Promise<{ community_invite: CommunityInvite }> {
  return clientApi.post<{ community_invite: CommunityInvite }>(
    `/api/v1/communities/${idOrSlug}/invites`,
    input,
  )
}

export function revokeInvite(idOrSlug: string, inviteId: string): Promise<void> {
  return clientApi.delete(`/api/v1/communities/${idOrSlug}/invites/${inviteId}`)
}

export function redeemInviteCode(code: string): Promise<{ community_invite: CommunityInvite }> {
  return clientApi.post<{ community_invite: CommunityInvite }>(
    '/api/v1/communities/invite-redemptions',
    { code },
  )
}

export function transferOwnership(idOrSlug: string, userId: string): Promise<void> {
  return clientApi.post(`/api/v1/communities/${idOrSlug}/ownership-transfers`, { user_id: userId })
}

const MY_COMMUNITIES_PAGE_LIMIT = 100
type MyCommunitiesListener = (communities: Community[]) => void

export async function loadMyCommunities(
  after?: string,
  available: Community[] = [],
  onAvailableCommunities?: MyCommunitiesListener,
): Promise<Community[]> {
  const response = await searchMyCommunities(MY_COMMUNITIES_PAGE_LIMIT, after)
  const previousCount = available.length
  for (const result of response.results) {
    const community = response.communities[result.id]
    if (community && !community.archived_at) {
      available.push(community)
    }
  }
  if (available.length > previousCount) {
    onAvailableCommunities?.([...available])
  }
  const nextAfter = response.page_info.has_next_page
    ? (response.page_info.end_cursor ?? undefined)
    : undefined
  return nextAfter ? loadMyCommunities(nextAfter, available, onAvailableCommunities) : available
}

export function fetchCommunityPinnedPosts(
  idOrSlug: string,
): Promise<CommunityPinnedPostsResponseBody> {
  return clientApi.get<CommunityPinnedPostsResponseBody>(
    `/api/v1/communities/${idOrSlug}/pinned-posts`,
  )
}

export function setCommunityPinnedPosts(
  idOrSlug: string,
  postIds: string[],
): Promise<CommunityPinnedPostsResponseBody> {
  return clientApi.put<CommunityPinnedPostsResponseBody>(
    `/api/v1/communities/${idOrSlug}/pinned-posts`,
    { post_ids: postIds },
  )
}
