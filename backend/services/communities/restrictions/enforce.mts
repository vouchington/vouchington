import assert from 'http-assert'
import type { QueryOptions } from '@data-stores/psql/types'
import type { BasicUser, PrivateUser } from '@services/users/types'
import type { CommunityRestriction, CommunityRestrictionType, CommunityMember } from '../types.mts'
import { activeRestrictionSet, getActiveCommunityRestrictions } from './get.mts'
import type { CreatePostInput } from '@voucha/types/entities/post'
import { getCommunityMember } from '../members/get.mts'
import extract from '@modules/markdown-extraction'

export async function getCommunityPostRestrictionDecision({
  communityId,
  currentUser,
  membership,
  options,
  updates,
}: {
  communityId: string
  currentUser: PrivateUser
  membership: CommunityMember | null
  updates: CreatePostInput
  options?: QueryOptions
}): Promise<{ requiresPostApproval: boolean }> {
  const restrictions = await getActiveCommunityRestrictions(communityId, options)
  const active = activeRestrictionSet(restrictions)
  const canBypassBlocks = canBypassBlockRestrictions(currentUser, membership)

  if (!canBypassBlocks) {
    assertApprovedMemberOnly(active, membership)
    assertNoNewMemberPosts(restrictions, membership)
    await assertNoLinks(active, updates)
  }

  return { requiresPostApproval: active.has('require_post_approval') }
}

export async function assertCommunityNoLinksAllowed({
  communityId,
  currentUser,
  options,
  updates,
}: {
  communityId: string
  currentUser: BasicUser
  options?: QueryOptions
  updates: CreatePostInput
}): Promise<void> {
  const membership = await getCommunityMember(communityId, currentUser.id, options)
  if (canBypassBlockRestrictions(currentUser, membership)) return
  const restrictions = await getActiveCommunityRestrictions(communityId, options)
  await assertNoLinks(activeRestrictionSet(restrictions), updates)
}

function canBypassBlockRestrictions(
  currentUser: BasicUser,
  membership: CommunityMember | null,
): boolean {
  return (
    currentUser.roles.includes('administrator') ||
    membership?.role === 'owner' ||
    membership?.role === 'moderator'
  )
}

function assertApprovedMemberOnly(
  active: Set<CommunityRestrictionType>,
  membership: CommunityMember | null,
): void {
  if (!active.has('approved_members_only')) return
  assert(
    membership?.approved_by_id,
    403,
    'This community is temporarily limited to approved members',
  )
}

function assertNoNewMemberPosts(
  restrictions: CommunityRestriction[],
  membership: CommunityMember | null,
): void {
  const restriction = restrictions.find(r => r.restriction_type === 'no_new_member_posts')
  if (!restriction) return
  assert(membership, 403, 'You must be a member of this community')
  assert(
    new Date(membership.created_at).getTime() <= new Date(restriction.activated_at).getTime(),
    403,
    'New members are temporarily blocked from posting in this community',
  )
}

async function assertNoLinks(
  active: Set<CommunityRestrictionType>,
  updates: CreatePostInput,
): Promise<void> {
  if (!active.has('no_links')) return
  assert(
    !(await postInputContainsLink(updates)),
    403,
    'Links are temporarily blocked in this community',
  )
}

async function postInputContainsLink(updates: CreatePostInput): Promise<boolean> {
  if (updates.url || updates.url_id) return true
  const parts: string[] = []
  if (updates.title) parts.push(updates.title)
  if (updates.markdown) parts.push(updates.markdown)
  if (updates.images) {
    for (const image of updates.images) {
      if (image.caption) parts.push(image.caption)
    }
  }
  collectStructuredDataStrings(updates.structured_data, parts)
  const combined = parts.join('\n')
  if (!combined) return false
  // image_urls not checked: no_links targets clickable brigade links, not image sources
  const { link_urls } = await extract(combined)
  return link_urls.length > 0
}

function collectStructuredDataStrings(value: unknown, acc: string[] = []): void {
  if (typeof value === 'string') {
    acc.push(value)
  } else if (value && typeof value === 'object') {
    if (Array.isArray(value)) {
      for (const item of value) {
        collectStructuredDataStrings(item, acc)
      }
    } else {
      for (const item of Object.values(value as Record<string, unknown>)) {
        collectStructuredDataStrings(item, acc)
      }
    }
  }
}
