import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import type { Community, CommunityMember } from './types.mts'
import { getCommunity, type CommunityWithOwner } from './get.mts'
import { currentUserCanModerateCommunity } from './authorization.mts'
import { invalidate } from '@services/entity-cache/invalidate'

export type CommunityRootPostType = 'discussion' | 'review' | 'data_point'

export type UpdateCommunityPostTypeSettingsInput = {
  allow_review_posts?: boolean
  allow_data_point_posts?: boolean
}

export function isCommunityRootPostType(postType: string): postType is CommunityRootPostType {
  return postType === 'discussion' || postType === 'review' || postType === 'data_point'
}

export function communityAllowsPostType(
  community: Pick<Community, 'allow_review_posts' | 'allow_data_point_posts'>,
  postType: CommunityRootPostType,
): boolean {
  if (postType === 'discussion') return true
  if (postType === 'review') return community.allow_review_posts
  return community.allow_data_point_posts
}

export async function updateCommunityPostTypeSettings(
  currentUser: PrivateUser,
  communityId: string,
  input: UpdateCommunityPostTypeSettingsInput,
  membership?: CommunityMember | null,
): Promise<CommunityWithOwner> {
  const community = await getCommunity(communityId)
  assert(community, 404, 'Community not found')
  assert(!community.archived_at, 403, 'Cannot update archived community')
  assert(currentUserCanModerateCommunity(currentUser, community, membership), 403, 'Forbidden')

  if ('allow_review_posts' in input) {
    assert(typeof input.allow_review_posts === 'boolean', 422, 'allow_review_posts must be boolean')
  }
  if ('allow_data_point_posts' in input) {
    assert(
      typeof input.allow_data_point_posts === 'boolean',
      422,
      'allow_data_point_posts must be boolean',
    )
  }

  const updateQuery = sql`/* updateCommunityPostTypeSettings */
    UPDATE communities SET updated_at = CURRENT_TIMESTAMP`

  if ('allow_review_posts' in input) {
    updateQuery.append(sql`, allow_review_posts = ${input.allow_review_posts}`)
  }
  if ('allow_data_point_posts' in input) {
    updateQuery.append(sql`, allow_data_point_posts = ${input.allow_data_point_posts}`)
  }

  updateQuery.append(sql`
    WHERE id = ${communityId}
      AND deleted_at IS NULL`)

  await write(updateQuery)
  const updated = await getCommunity(communityId)
  assert(updated, 404, 'Community not found after update')
  await invalidate.communities(community, updated)
  return updated
}
