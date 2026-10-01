import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { invalidate } from '@services/entity-cache/invalidate'
import type { CommunityAutomodAction, CommunityMember } from './types.mts'
import { getCommunity, type CommunityWithOwner } from './get.mts'
import { currentUserCanModerateCommunity } from './authorization.mts'

export const COMMUNITY_AUTOMOD_ACTIONS = [
  'record_only',
  'review_queue',
  'unpublish',
] as const satisfies readonly CommunityAutomodAction[]

export type UpdateCommunityAutomodSettingsInput = { automod_action: CommunityAutomodAction }

/**
 * Sets what the community's AI moderation prompts do to a published post one of them flags. The
 * action is read when a classifier run applies its effects and is not part of the run's identity,
 * so changing it never re-bills a classification.
 */
export async function updateCommunityAutomodSettings(
  currentUser: PrivateUser,
  communityId: string,
  input: UpdateCommunityAutomodSettingsInput,
  membership?: CommunityMember | null,
): Promise<CommunityWithOwner> {
  const community = await getCommunity(communityId)
  assert(community, 404, 'Community not found')
  assert(!community.archived_at, 403, 'Cannot update archived community')
  assert(currentUserCanModerateCommunity(currentUser, community, membership), 403, 'Forbidden')
  assert(
    COMMUNITY_AUTOMOD_ACTIONS.includes(input.automod_action),
    422,
    'automod_action must be record_only, review_queue or unpublish',
  )

  await write(sql`/* updateCommunityAutomodSettings */
    UPDATE communities
    SET automod_action = ${input.automod_action}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ${communityId} AND deleted_at IS NULL`)
  const updated = await getCommunity(communityId)
  assert(updated, 404, 'Community not found after update')
  await invalidate.communities(community, updated)
  return updated
}
