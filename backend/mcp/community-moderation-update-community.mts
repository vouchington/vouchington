import assert from 'http-assert'
import {
  currentUserCanDeleteCommunity,
  currentUserCanUpdateCommunity,
  loadCommunityWithViewer,
  setCommunityArchiveState,
  updateCommunity,
  updateCommunityAndSetArchiveState,
  type UpdateCommunityInput,
} from '@services/communities'
import { attachWrittenCommunityProvenance } from '@services/content-provenance'
import type { CommunityModerationHandler } from './community-moderation-contract.mts'

export const updateCommunitySettings: CommunityModerationHandler = async (user, args) => {
  const { community, membership } = await loadCommunityWithViewer(args.community, user.id)
  const { community: _community, archive, ...updateBody } = args
  const hasUpdateFields = Object.keys(updateBody).length > 0

  if (archive !== undefined) {
    assert(currentUserCanDeleteCommunity(user, community, membership), 403, 'Forbidden')
  }
  if (archive === undefined || hasUpdateFields) {
    assert(currentUserCanUpdateCommunity(user, community, membership), 403, 'Forbidden')
  }

  if (community.archived_at) {
    if (archive === true) assert(false, 409, 'Community is already archived')
    assert(archive === false && !hasUpdateFields, 409, 'Archived communities cannot be updated')
  }

  const input: UpdateCommunityInput = { ...updateBody } as UpdateCommunityInput
  if ('member_invites_allowed_at' in updateBody) {
    input.member_invites_allowed_at = updateBody.member_invites_allowed_at
      ? (community.member_invites_allowed_at ?? new Date())
      : null
  }
  if ('post_approval_required_at' in updateBody) {
    input.post_approval_required_at = updateBody.post_approval_required_at
      ? (community.post_approval_required_at ?? new Date())
      : null
  }

  let updated = community
  if (archive !== undefined && hasUpdateFields) {
    updated = await updateCommunityAndSetArchiveState(
      user,
      community.id,
      input,
      archive as boolean,
      membership,
    )
  } else if (archive === undefined) {
    updated = await updateCommunity(user, community.id, input, membership)
  } else {
    updated = await setCommunityArchiveState(
      user,
      community.id,
      archive as boolean,
      membership,
      community,
    )
  }

  const { owner: _owner, ...communityData } = updated
  return { community: await attachWrittenCommunityProvenance(communityData, null) }
}
