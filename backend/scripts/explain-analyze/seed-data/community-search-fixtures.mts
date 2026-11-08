import { seedCommunityAgentPromptPages } from './community-agent-prompt-pages.mts'
import { seedCommunityAgentPromptSlotCountNoise } from './community-agent-prompt-slot-counts.mts'
import { seedCommunityMembershipCaps } from './community-membership-caps.mts'
import { seedPrivateSearchCommunity } from './community-search-exclusions.mts'
import {
  seedNonListCommunities,
  seedRemovedCommunityMemberNoise,
} from './community-search-noise.mts'
import {
  seedCommunities,
  seedCommunityListItemTopic,
  seedCommunityPosts,
  seedCommunityProxyFollowsAndMutes,
  seedTrendingCommunityPostIds,
} from './engagement.mts'
import { seedViewDrivenCommunityPosts } from './view-driven-community-posts.mts'
import { seedViewDrivenLists } from './view-driven-lists.mts'
import { seedViewDrivenPrompts } from './view-driven-prompts.mts'
import { seedModerationSummaryRecipient } from './view-driven-reads.mts'
import { seedCommunityHotPosts } from './community-hot.mts'

export async function seedCommunitySearchFixtures() {
  await seedCommunityMembershipCaps()
  await seedCommunityAgentPromptPages()
  await seedCommunityAgentPromptSlotCountNoise()
  await seedCommunities(5, 200)
  await seedRemovedCommunityMemberNoise()
  await seedModerationSummaryRecipient()
  await seedViewDrivenLists()
  await seedViewDrivenPrompts()
  await seedNonListCommunities()
  await seedPrivateSearchCommunity()
  await seedCommunityListItemTopic()
  await seedCommunityPosts()
  await seedTrendingCommunityPostIds()
  await seedViewDrivenCommunityPosts()
  await seedCommunityHotPosts()
  await seedCommunityProxyFollowsAndMutes()
}
