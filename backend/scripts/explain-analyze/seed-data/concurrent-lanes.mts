import { seedAdminEmails } from './admin-emails.mts'
import { RSS_FEED_SEED_COUNT, RSS_FEED_ITEM_SEED_COUNT } from './common.mts'
import {
  INDIVIDUAL_CARD_SEED_COUNT,
  POINT_VALUATION_SEED_COUNT,
  REWARDS_PROGRAM_STATUS_SEED_COUNT,
  SPENDING_CATEGORY_SEED_COUNT,
  seedHostnames,
  seedIndividualCards,
  seedPointValuations,
  seedPosts,
  seedRemoteFollowers,
  seedRewardsProgramStatuses,
  seedRssFeeds,
  seedSemanticRssFeedItems,
  seedSpendingCategories,
  seedTopicImportAttempts,
  seedTopicParentRelations,
  seedTopics,
  seedUrls,
  seedUserRemovedPlatformPosts,
  seedUserRoleLookups,
} from './core.mts'
import { seedHostnameCrawlSweeps } from './hostname-crawl-sweeps.mts'
import { seedHostnameCacheInvalidationWork, seedHostnameFlags } from './hostname-flags.mts'
import { seedImportRequestRetention } from './import-request-retention.mts'
import { checkpointSeed } from './maintenance.mts'
import { seedMembershipChange } from './membership-changes.mts'
import { seedMembershipProducts, seedMemberships, seedMembershipRefunds } from './memberships.mts'
import { seedPostCreationModerationBypass } from './post-creation-moderation-bypass.mts'
import { seedPostFeedShares } from './post-feed-shares.mts'
import { seedPostModerationRetention } from './post-moderation-retention.mts'
import {
  seedBlocklistedDomains,
  seedCopyrightStaffEvidence,
  seedUserAgentStrings,
} from './round-trip-shapes.mts'
import { seedSemanticPosts } from './semantic-posts.mts'

/**
 * The post lane writes only posts and their projections, and needs only the seeded users. The
 * lookup lane never reads or writes posts, so the posts-wide DROP INDEX and index build inside
 * seedSemanticPosts cannot queue behind it. Their write sets are disjoint, so each table receives
 * its rows in the same order as a serial run while the two lanes use separate Postgres backends.
 */
export async function seedUsersDependentFixtures(): Promise<void> {
  await Promise.all([seedPostLane(), seedLookupLane()])
}

async function seedPostLane(): Promise<void> {
  await seedPosts(100_000)
  await seedPostCreationModerationBypass()
  await seedPostModerationRetention()
  await seedSemanticPosts()
  await seedPostFeedShares()
  await seedUserRemovedPlatformPosts()
}

async function seedLookupLane(): Promise<void> {
  await seedUserRoleLookups()
  await seedAdminEmails()
  await seedTopicImportAttempts()
  await seedImportRequestRetention()
  await seedMembershipProducts()
  await seedMemberships()
  await seedMembershipChange()
  await seedMembershipRefunds()
  await checkpointSeed('memberships')
  await seedHostnames()
  await seedHostnameFlags()
  await seedHostnameCrawlSweeps()
  await seedBlocklistedDomains()
  await seedHostnameCacheInvalidationWork()
  await seedUserAgentStrings()
  await seedCopyrightStaffEvidence()
  await seedRemoteFollowers()
  await seedUrls()
  await seedTopics(2500)
  await seedIndividualCards(INDIVIDUAL_CARD_SEED_COUNT)
  await seedPointValuations(POINT_VALUATION_SEED_COUNT)
  await seedSpendingCategories(SPENDING_CATEGORY_SEED_COUNT)
  await seedRewardsProgramStatuses(REWARDS_PROGRAM_STATUS_SEED_COUNT)
  await seedTopicParentRelations(500)
  await seedRssFeeds(RSS_FEED_SEED_COUNT, RSS_FEED_ITEM_SEED_COUNT)
  await seedSemanticRssFeedItems()
}
