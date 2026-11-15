import { deactivateCommunityPromptsForUser } from '@services/community-agent-prompts/deactivate-for-user'

export const processCommunityAgentPromptsDeactivated = async ({
  actorUserId,
  userId,
  communityId,
}: {
  actorUserId: string
  userId: string
  communityId: string
}) => {
  await deactivateCommunityPromptsForUser(actorUserId, userId, communityId)
}
