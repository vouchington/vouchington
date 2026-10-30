import type { TransactionQuery } from '@data-stores/psql'
import { seedPlaywrightCleanupAndUsers } from './playwright-seed-cleanup-and-users.mts'
import { seedPlaywrightMembershipsAndCommunities } from './playwright-seed-memberships-and-communities.mts'
import { seedPlaywrightCrawlersAndCrawls } from './playwright-seed-crawlers-and-crawls.mts'
import { seedPlaywrightCardTopics } from './playwright-seed-card-topics.mts'
import { seedPlaywrightDiscussionPosts } from './playwright-seed-discussion-posts.mts'

export async function seedPlaywrightCoreData(
  query: TransactionQuery,
  testUserEmail: string,
): Promise<void> {
  await seedPlaywrightCleanupAndUsers(query, testUserEmail)
  await seedPlaywrightMembershipsAndCommunities(query, testUserEmail)
  await seedPlaywrightCrawlersAndCrawls(query, testUserEmail)
  await seedPlaywrightCardTopics(query, testUserEmail)
  await seedPlaywrightDiscussionPosts(query, testUserEmail)
}
