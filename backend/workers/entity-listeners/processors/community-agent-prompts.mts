import { deactivateCommunityPromptsForUser } from '@services/community-agent-prompts/deactivate-for-user'
import { enqueueProcessCommunityAgentPromptsDeactivated } from '@queues/entity-listeners/enqueues/enqueue-jobs'

export const processCommunityAgentPromptsDeactivated = async ({
  actorUserId,
  userId,
  communityId,
}: {
  actorUserId: string
  userId: string
  communityId: string
}) => {
  const result = await deactivateCommunityPromptsForUser(actorUserId, userId, communityId)
  if (result.hasMore) {
    await enqueueProcessCommunityAgentPromptsDeactivated({ actorUserId, userId, communityId })
  }
  return result
}
