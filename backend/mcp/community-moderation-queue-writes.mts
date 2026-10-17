import { claimModerationQueueItem, releaseModerationQueueItem } from '@services/moderation-claims'
import {
  deEscalateModerationQueueItem,
  escalateModerationQueueItem,
  openModInternalThread,
} from '@services/moderation-threads'
import { dismissCommunityAutomodFlag } from '@services/communities/publications/automod-flag'
import {
  communityModerationNoContent,
  type CommunityModerationHandler,
} from './community-moderation-contract.mts'
import { staffOrModeratorCommunity } from './community-moderation-guards.mts'

type Item = 'post' | 'report'
function target(args: Record<string, unknown>, item: Item) {
  return item === 'post' ? { postId: args.postId as string } : { reportId: args.reportId as string }
}
async function claim(
  user: Parameters<CommunityModerationHandler>[0],
  args: Parameters<CommunityModerationHandler>[1],
  item: Item,
) {
  const { community } = await staffOrModeratorCommunity(user, args.community)
  const result = await claimModerationQueueItem(user.id, {
    communityId: community.id,
    ...target(args, item),
  })
  return { claim: result.claim, claimed_by_other: result.claimed_by_other }
}
async function release(
  user: Parameters<CommunityModerationHandler>[0],
  args: Parameters<CommunityModerationHandler>[1],
  item: Item,
) {
  const { community } = await staffOrModeratorCommunity(user, args.community)
  await releaseModerationQueueItem(user.id, { communityId: community.id, ...target(args, item) })
  return communityModerationNoContent()
}
async function escalate(
  user: Parameters<CommunityModerationHandler>[0],
  args: Parameters<CommunityModerationHandler>[1],
  item: Item,
) {
  const { community } = await staffOrModeratorCommunity(user, args.community)
  await escalateModerationQueueItem(user.id, { communityId: community.id, ...target(args, item) })
  return communityModerationNoContent()
}
async function deescalate(
  user: Parameters<CommunityModerationHandler>[0],
  args: Parameters<CommunityModerationHandler>[1],
  item: Item,
) {
  const { community } = await staffOrModeratorCommunity(user, args.community)
  await deEscalateModerationQueueItem(user.id, { communityId: community.id, ...target(args, item) })
  return communityModerationNoContent()
}
async function openThread(
  user: Parameters<CommunityModerationHandler>[0],
  args: Parameters<CommunityModerationHandler>[1],
  item: Item,
) {
  const { community } = await staffOrModeratorCommunity(user, args.community)
  const conversation = await openModInternalThread(user.id, {
    communityId: community.id,
    ...target(args, item),
  })
  return { conversation }
}
export const communityModerationQueueWrites: Record<string, CommunityModerationHandler> = {
  claim_post: (user, args) => claim(user, args, 'post'),
  claim_report: (user, args) => claim(user, args, 'report'),
  release_post_claim: (user, args) => release(user, args, 'post'),
  release_report_claim: (user, args) => release(user, args, 'report'),
  escalate_post: (user, args) => escalate(user, args, 'post'),
  escalate_report: (user, args) => escalate(user, args, 'report'),
  deescalate_post: (user, args) => deescalate(user, args, 'post'),
  deescalate_report: (user, args) => deescalate(user, args, 'report'),
  open_post_mod_internal_thread: (user, args) => openThread(user, args, 'post'),
  open_report_mod_internal_thread: (user, args) => openThread(user, args, 'report'),
  async dismiss_automod_flag(user, args) {
    const { community } = await staffOrModeratorCommunity(user, args.community)
    await dismissCommunityAutomodFlag({
      communityId: community.id,
      postId: args.postId as string,
      dismissedById: user.id,
    })
    return communityModerationNoContent()
  },
}
