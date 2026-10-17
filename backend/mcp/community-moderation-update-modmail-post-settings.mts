import assert from 'http-assert'
import { isUUID } from '@modules/utils'
import {
  getCommunityMember,
  loadCommunityWithViewer,
  updateCommunityPostTypeSettings as updateCommunityPostTypeSettingsService,
  type UpdateCommunityPostTypeSettingsInput,
} from '@services/communities'
import {
  assignModmailThread,
  currentUserCanViewModmailThread,
  getModmailThread,
  hasOpenModmailThread,
  resolveModmailThread,
  unresolveModmailThread,
} from '@services/modmail'
import { attachWrittenCommunityProvenance } from '@services/content-provenance'
import type { CommunityModerationHandler } from './community-moderation-contract.mts'

export const updateModmailThread: CommunityModerationHandler = async (user, args) => {
  const conversationId = args.conversationId as string
  assert(isUUID(conversationId), 422, 'Invalid conversation ID')
  const { community, membership } = await loadCommunityWithViewer(args.community, user.id)
  assert(currentUserCanViewModmailThread(user, community, membership), 403, 'Forbidden')

  const thread = await getModmailThread(conversationId)
  assert(thread, 404, 'Modmail thread not found')
  assert(thread.community_id === community.id, 404, 'Modmail thread not found')

  if (typeof args.assigned_moderator_user_id === 'string') {
    const assignee = await getCommunityMember(community.id, args.assigned_moderator_user_id)
    assert(
      assignee &&
        !assignee.removed_at &&
        (assignee.role === 'owner' || assignee.role === 'moderator'),
      422,
      'assigned_moderator_user_id must be an active owner or moderator in this community',
    )
    await assignModmailThread(conversationId, args.assigned_moderator_user_id)
  }
  if (args.resolved === true) {
    await resolveModmailThread(conversationId, user.id)
  } else if (args.resolved === false) {
    const alreadyOpen = await hasOpenModmailThread(
      thread.community_id!,
      thread.subject_user_id!,
      conversationId,
    )
    assert(!alreadyOpen, 409, 'Another open thread already exists for this subject')
    await unresolveModmailThread(conversationId)
  }

  return { thread: await getModmailThread(conversationId) }
}

export const updateCommunityPostTypeSettings: CommunityModerationHandler = async (user, args) => {
  const { community, membership } = await loadCommunityWithViewer(args.community, user.id)
  const { community: _community, ...input } = args
  const updated = await updateCommunityPostTypeSettingsService(
    user,
    community.id,
    input as UpdateCommunityPostTypeSettingsInput,
    membership,
  )
  const { owner: _owner, ...communityData } = updated
  return { community: await attachWrittenCommunityProvenance(communityData, null) }
}
