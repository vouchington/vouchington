import type { PrivateUser } from '@services/users/types'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { IDENTITY_REQUIRED } from '@modules/on-error/error-codes'
import type { Community, CommunityMember } from './types.mts'

export function currentUserCanUpdateCommunity(
  currentUser: PrivateUser | null,
  _community: Community,
  membership?: CommunityMember | null,
): boolean {
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true
  return membership?.role === 'owner'
}

export function currentUserCanDeleteCommunity(
  currentUser: PrivateUser | null,
  _community: Community,
  membership?: CommunityMember | null,
): boolean {
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true
  return membership?.role === 'owner'
}

export function currentUserCanModerateCommunity(
  currentUser: PrivateUser | null,
  _community: Community,
  membership?: CommunityMember | null,
): boolean {
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true
  return membership?.role === 'owner' || membership?.role === 'moderator'
}

export function currentUserCanPostInCommunity(
  currentUser: PrivateUser | null,
  _community: Community,
  membership?: CommunityMember | null,
): boolean {
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true
  return !!membership && !membership.removed_at
}

export function currentUserCanCreateCommunity(currentUser: PrivateUser): boolean {
  if (currentUser.roles.includes('administrator')) return true
  return !!currentUser.username
}

export function assertCanCreateCommunity(currentUser: PrivateUser): void {
  if (currentUser.roles.includes('administrator')) return
  if (!currentUser.username) {
    throw createCodedError(403, 'A username is required to create a community', IDENTITY_REQUIRED)
  }
}

export function currentUserCanManageCommunityList(
  currentUser: PrivateUser | null,
  _community: Community,
  membership?: CommunityMember | null,
): boolean {
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true
  return membership?.role === 'owner' || membership?.role === 'moderator'
}

export function currentUserCanManageCommunityBans(
  currentUser: PrivateUser | null,
  _community: Community,
  membership?: CommunityMember | null,
): boolean {
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true
  return membership?.role === 'owner' || membership?.role === 'moderator'
}

export function currentUserCanViewCommunity(
  currentUser: PrivateUser | null,
  community: Community,
  membership?: CommunityMember | null,
): boolean {
  if (community.visibility === 'public') return true
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true
  return !!membership && !membership.removed_at
}
