import {
  read,
  beginTransaction,
  type QueryInput,
  type QueryValues,
  type TransactionQuery,
} from '@data-stores/psql'
import { invalidateMembershipProductCaches } from '@services/memberships/get'
import { upsertRecentlyViewed } from '@services/recently-viewed'
import { seedPlaywrightCoreData } from './playwright-test-data/core.mts'
import { seedPlaywrightPostData } from './playwright-test-data/posts.mts'
import { seedPlaywrightFeedData } from './playwright-test-data/feeds.mts'
import { seedPlaywrightConversations } from './playwright-test-data/conversations.mts'
import { seedPlaywrightPublisherTypeTopics } from './playwright-test-data/core-publisher-type-topics.mts'
import { seedPlaywrightRssFeedCategoryData } from './playwright-test-data/rss-feed-categories.mts'
let seeded = false

export function createPlaywrightSeedQuery(query: TransactionQuery): TransactionQuery {
  async function annotatedQuery<Row extends Record<string, unknown> = any>(
    input: QueryInput,
    values?: QueryValues,
  ) {
    if (typeof input !== 'string') {
      throw new TypeError('Playwright seed queries must be SQL strings')
    }
    return query<Row>(`/* seedPlaywrightTestData */ ${input}`, values)
  }

  return Object.assign(annotatedQuery, { client: query.client }) as TransactionQuery
}

function getTestUserEmail(): string {
  return process.env.WEB_INTEGRATION_TEST_USER_EMAIL ?? 'tests@voucha.ai'
}
export async function seedPlaywrightTestData() {
  if (seeded) throw new Error('Playwright test data already seeded')
  seeded = true
  const testUserEmail = getTestUserEmail()
  try {
    {
      await using transaction = await beginTransaction()
      const query = transaction
      const seedQuery = createPlaywrightSeedQuery(query)
      await seedQuery(`SELECT pg_advisory_xact_lock(hashtext('voucha:playwright-test-data'))`)
      await seedPlaywrightCoreData(seedQuery, testUserEmail)
      /* v8 ignore next -- exercised by Playwright global setup, not Vitest coverage */
      await seedPlaywrightPublisherTypeTopics(seedQuery)
      await seedPlaywrightPostData(seedQuery)
      await seedPlaywrightFeedData(seedQuery)
      /* v8 ignore next -- exercised by Playwright global setup, not Vitest coverage */
      await seedPlaywrightConversations(seedQuery)
      /* v8 ignore next -- exercised by Playwright global setup, not Vitest coverage */
      await seedPlaywrightRssFeedCategoryData(seedQuery)

      await transaction.commit()
    }
    await invalidateMembershipProductCaches()
    /* v8 ignore next */
    const testUserId = '019f0000-0000-7000-8000-000000000000'
    /* v8 ignore next */
    const testSessionId = '019f0000-0000-7000-8000-000000000000'
    await upsertRecentlyViewed(
      'topic',
      '019c64e6-b100-7000-b000-000000000001',
      testSessionId,
      testUserId,
    )
    const { rows: rssItemRows } = await read(
      `/* seedPlaywrightTestData.rssItem */ SELECT id FROM rss_feed_item_ids WHERE guid = 'test-item-1' AND url_hostname_id = '019c64e6-1000-7000-b000-000000000001' LIMIT 1`,
    )
    const rssItemId = (rssItemRows[0] as { id: string } | undefined)?.id
    if (rssItemId) await upsertRecentlyViewed('rss_feed_item', rssItemId, testSessionId, testUserId)
  } catch (error) {
    seeded = false
    throw error
  }
}
if (import.meta.url === `file://${process.argv[1]}`) {
  await seedPlaywrightTestData()
  process.exit(0)
}
