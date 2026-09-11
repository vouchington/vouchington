import type { TransactionQuery } from '@data-stores/psql'
import { seedPlaywrightCleanupAndUsers } from './core-cleanup-and-users.mts'
import { seedPlaywrightMembershipsAndCommunities } from './core-memberships-and-communities.mts'
import { seedPlaywrightCrawlersAndCrawls } from './core-crawlers-and-crawls.mts'
import { seedPlaywrightCardTopics } from './core-card-topics.mts'
import { seedPlaywrightDiscussionPosts } from './core-discussion-posts.mts'

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
