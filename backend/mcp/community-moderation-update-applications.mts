import assert from 'http-assert'
import {
  approveApplication,
  currentUserCanUpdateCommunity,
  loadCommunityWithViewer,
  loadCommunityForModerator,
  rejectApplication,
  setApplicationQuestions,
  type ApplicationQuestionInput,
} from '@services/communities'
import {
  communityModerationNoContent,
  type CommunityModerationHandler,
} from './community-moderation-contract.mts'

export const reviewApplication: CommunityModerationHandler = async (user, args) => {
  await loadCommunityForModerator(user, args.community)
  if (args.status === 'approved') {
    await approveApplication(user, args.id as string)
  } else {
    await rejectApplication(user, args.id as string, args.reason as string | undefined)
  }
  return communityModerationNoContent()
}

export const setCommunityApplicationQuestions: CommunityModerationHandler = async (user, args) => {
  const { community, membership } = await loadCommunityWithViewer(args.community, user.id)
  assert(currentUserCanUpdateCommunity(user, community, membership), 403, 'Forbidden')
  const questions = await setApplicationQuestions(
    user.id,
    community.id,
    args.questions as ApplicationQuestionInput[],
  )
  return { questions }
}
