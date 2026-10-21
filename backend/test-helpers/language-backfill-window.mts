import { randomInt, randomUUID } from 'node:crypto'
import { getDateFromUUIDv7, getMaxUUIDv7ForDate } from '@modules/utils/ids'
import { createTestUser } from './entities/users.mts'
import { createTestTopic } from './entities/create-test-entities.mts'
import { insertTestRssFeed } from './entities/rss-feeds.mts'
import { insertTestRssFeedItem } from './entities/rss-feed-items.mts'
import { insertTestUrlDirect } from './entities/urls.mts'
import {
  insertLanguageDetectionPostForTest,
  insertLanguageDetectionCommunityForTest,
  insertLanguageDetectionUserForTest,
  insertLanguageDetectionTopicForTest,
  insertLanguageDetectionCrawlForTest,
} from './sql-language-detection-fixtures.mts'
import type { LanguageDetectionEntityTable } from './sql-language-detection-state.mts'

const text =
  'This English article contains clear sentences, familiar vocabulary, and enough surrounding context for reliable language detection. It describes a local community sharing useful information with its readers.'
const title = 'An English article about sharing information'
const communityName =
  'This English community shares useful stories and practical information with local readers.'

export const languageBackfillTables = [
  'posts',
  'rss_feed_items',
  'crawls',
  'communities',
  'users',
  'topics',
] as const satisfies readonly LanguageDetectionEntityTable[]

/** A genuine resumed UUIDv7 interval containing exactly three owned row identities. */
export async function createLanguageBackfillWindow(table: LanguageDetectionEntityTable) {
  const fence = new Date(Date.now() - randomInt(86_400_000, 172_800_000))
  const upper = getMaxUUIDv7ForDate(fence)
  const numericUpper = BigInt(`0x${upper.replaceAll('-', '')}`)
  const beforeUpper = (offset: bigint) => {
    const hex = (numericUpper - offset).toString(16).padStart(32, '0')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  const lower = beforeUpper(3n)
  const ids = [beforeUpper(2n), beforeUpper(1n), upper]
  for (const id of [lower, ...ids]) {
    if (getDateFromUUIDv7(id)?.getTime() !== fence.getTime()) {
      throw new Error('Owned backfill IDs must retain the historical UUIDv7 fence')
    }
  }
  const insert = await entityInserter(table)
  const lowerId = await insert(lower)
  for (const id of ids) await insert(id)
  const laterId = await insert()
  if (laterId <= upper) throw new Error('Later fixture must be beyond the retained upper fence')
  return {
    ids,
    lowerId,
    laterId,
    cursor: { sweepStartedAt: fence.toISOString(), afterId: lower },
    upper,
    expectedTextForId: (id: string) => (table === 'topics' ? `${text} ${id}` : expectedText(table)),
  }
}

async function entityInserter(table: LanguageDetectionEntityTable) {
  const owner = await createTestUser()
  if (table === 'rss_feed_items') {
    const topic = await createTestTopic()
    const feedId = await insertTestRssFeed({ topicId: topic.id, title: 'Language backfill feed' })
    return async (id?: string) => {
      const token = randomUUID()
      const url = await insertTestUrlDirect(null, `https://backfill-${token}.example.com/item`)
      if (!url) throw new Error('Expected owned RSS item URL')
      return insertTestRssFeedItem({
        id,
        rssFeedId: feedId,
        urlId: url.id,
        guid: token,
        itemData: { title, contentSnippet: text },
        contentSha256: Buffer.alloc(32, 0),
      })
    }
  }
  return async (id?: string) => {
    const token = randomUUID()
    switch (table) {
      case 'posts':
        return insertLanguageDetectionPostForTest({
          id,
          createdById: owner.id,
          title,
          markdown: text,
        })
      case 'communities':
        return insertLanguageDetectionCommunityForTest({
          id,
          createdById: owner.id,
          name: communityName,
          slug: `backfill-${token}`,
        })
      case 'users':
        return insertLanguageDetectionUserForTest({
          id,
          username: `bf-${token.slice(0, 12)}`,
          markdown: text,
        })
      case 'topics':
        return insertLanguageDetectionTopicForTest({
          id,
          createdById: owner.id,
          name: `${text} ${id ?? token}`,
          slug: `backfill-${token}`,
        })
      case 'crawls':
        return insertLanguageDetectionCrawlForTest({
          id,
          hostname: `backfill-${token}.example.com`,
          url: `https://backfill-${token}.example.com/page`,
          title,
          markdown: text,
        })
      default:
        throw new Error(`Unsupported language backfill table: ${table}`)
    }
  }
}

function expectedText(table: LanguageDetectionEntityTable): string {
  if (table === 'communities') return communityName
  if (table === 'posts' || table === 'rss_feed_items' || table === 'crawls') {
    return `${title}\n\n${text}`
  }
  return text
}
