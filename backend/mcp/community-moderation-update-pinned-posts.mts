import { loadCommunityForModerator, setPinnedPosts } from '@services/communities'
import type { CommunityModerationHandler } from './community-moderation-contract.mts'

export const setCommunityPinnedPosts: CommunityModerationHandler = async (user, args) => {
  const { community } = await loadCommunityForModerator(user, args.community)
  const pinnedPosts = await setPinnedPosts(user, community.id, args.post_ids as string[])
  return { pinned_posts: pinnedPosts }
}
