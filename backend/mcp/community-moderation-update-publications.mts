import assert from 'http-assert'
import {
  approvePublication,
  loadCommunityForPublicationModerator,
  overridePublication,
  rejectPublication,
  unpublishPost,
} from '@services/communities'
import { isModerationStaff } from '@services/users'
import {
  communityModerationNoContent,
  type CommunityModerationHandler,
} from './community-moderation-contract.mts'

export const moderateCommunityPost: CommunityModerationHandler = async (user, args) => {
  const postId = args.postId as string
  const { community } = await loadCommunityForPublicationModerator(user, args.community)
  assert(typeof args.status === 'string', 422, 'status must be a string')
  assert(
    args.reason === undefined || typeof args.reason === 'string',
    422,
    'reason must be a string',
  )
  assert(
    args.reason_code === undefined || typeof args.reason_code === 'string',
    422,
    'reason_code must be a string',
  )
  assert(
    args.private_note === undefined || typeof args.private_note === 'string',
    422,
    'private_note must be a string',
  )

  const status = args.status
  if (isModerationStaff(user)) {
    const action = statusToPlatformAction(status)
    assert(action, 422, 'Invalid platform publication status')
    assert(args.reason_code, 422, 'reason_code is required for platform overrides')
    await overridePublication(user, community.id, postId, {
      action,
      reasonCode: args.reason_code,
      privateNote: args.private_note,
    })
  } else if (status === 'approved') {
    await approvePublication(user, community.id, postId, { trainingEvidence: 'agent' })
  } else if (status === 'rejected') {
    await rejectPublication(user, community.id, postId, args.reason as string | undefined, {
      trainingEvidence: 'agent',
    })
  } else if (status === 'unpublished') {
    await unpublishPost(user, community.id, postId, { trainingEvidence: 'agent' })
  } else {
    assert(false, 422, "Invalid status; must be one of 'approved', 'rejected', or 'unpublished'")
  }
  return communityModerationNoContent()
}

function statusToPlatformAction(status: string) {
  if (status === 'approved') return 'approve' as const
  if (status === 'rejected') return 'reject' as const
  if (status === 'unpublished') return 'unpublish' as const
  if (status === 'restored') return 'restore' as const
  return null
}
