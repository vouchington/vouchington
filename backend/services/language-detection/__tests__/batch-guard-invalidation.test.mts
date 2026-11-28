import { randomInt } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  createRandomString,
  createTestTopic,
  createTestUser,
  getLanguageDetectionStateForTest,
  insertLanguageDetectionCommunityForTest,
  insertLanguageDetectionCrawlForTest,
  insertLanguageDetectionPostForTest,
  insertLanguageDetectionTopicForTest,
  insertLanguageDetectionUserForTest,
  insertTestRssFeed,
  insertTestRssFeedItem,
} from '@voucha/test-helpers'
import { caches } from '@services/entity-cache/caches'
import { addUrl } from '@services/urls'
import type { PrivateUser } from '@services/users/types'
import { runBatch, type LanguageDetectionBatch } from '../batch-helpers.mts'

const ENGLISH = 'The quick brown fox jumps over the lazy dog near the quiet river bank today'
const GERMAN = 'Die Würde des Menschen ist unantastbar und ihr Schutz ist Verpflichtung aller'
const randomDigits = () => String(randomInt(1_000_000_000, 10_000_000_000))
const GUARDED_SENTINEL = { sentinel: 'guarded-out' }
const PENDING = { declaredLanguage: null, inputSha256: null } as const

type EntityCache = {
  set: (key: string, value: unknown) => Promise<unknown>
  get: (key: string) => Promise<unknown>
  delete: (...keys: string[]) => Promise<unknown>
}

type GuardCase = {
  table: LanguageDetectionBatch['table']
  cache?: EntityCache
  setup: (user: PrivateUser) => Promise<{
    matchingId: string
    guardedOutId: string
    batch: LanguageDetectionBatch
  }>
}

const guardCases: GuardCase[] = [
  {
    table: 'posts',
    cache: caches.posts,
    setup: async user => {
      const [matchingId, guardedOutId] = await Promise.all([
        insertLanguageDetectionPostForTest({
          createdById: user.id,
          title: 'Matching post',
          markdown: ENGLISH,
        }),
        insertLanguageDetectionPostForTest({
          createdById: user.id,
          title: 'Edited post',
          markdown: GERMAN,
        }),
      ])
      return {
        matchingId,
        guardedOutId,
        batch: {
          table: 'posts',
          rows: [
            {
              ...PENDING,
              id: matchingId,
              text: `Matching post\n\n${ENGLISH}`,
              title: 'Matching post',
              markdown: ENGLISH,
            },
            {
              ...PENDING,
              id: guardedOutId,
              text: `Edited post\n\n${ENGLISH}`,
              title: 'Edited post',
              markdown: ENGLISH,
            },
          ],
        },
      }
    },
  },
  {
    table: 'rss_feed_items',
    cache: caches.rss_feed_items,
    setup: async () => {
      const suffix = createRandomString(10)
      const topic = await createTestTopic()
      const feedId = await insertTestRssFeed({ topicId: topic.id, title: `Guard Feed ${suffix}` })
      const [matchingUrl, guardedUrl] = await Promise.all([
        addUrl(null, `https://rss-guard-m-${suffix}.example.com/item`),
        addUrl(null, `https://rss-guard-g-${suffix}.example.com/item`),
      ])
      const matchingData = { title: 'Matching RSS', contentSnippet: ENGLISH }
      const [matchingId, guardedOutId] = await Promise.all([
        insertTestRssFeedItem({
          rssFeedId: feedId,
          urlId: matchingUrl!.id,
          guid: `guid-guard-m-${suffix}`,
          itemData: matchingData,
          contentSha256: Buffer.alloc(32, 0),
        }),
        insertTestRssFeedItem({
          rssFeedId: feedId,
          urlId: guardedUrl!.id,
          guid: `guid-guard-g-${suffix}`,
          itemData: { title: 'Edited RSS', contentSnippet: GERMAN },
          contentSha256: Buffer.alloc(32, 0),
        }),
      ])
      return {
        matchingId,
        guardedOutId,
        batch: {
          table: 'rss_feed_items',
          rows: [
            { ...PENDING, id: matchingId, text: `Matching RSS\n\n${ENGLISH}`, data: matchingData },
            {
              ...PENDING,
              id: guardedOutId,
              text: `Edited RSS\n\n${ENGLISH}`,
              data: { title: 'Edited RSS', contentSnippet: ENGLISH },
            },
          ],
        },
      }
    },
  },
  {
    table: 'crawls',
    setup: async () => {
      const suffix = createRandomString(10)
      const [matchingId, guardedOutId] = await Promise.all([
        insertLanguageDetectionCrawlForTest({
          hostname: `crawl-guard-m-${suffix}.example.com`,
          url: `https://crawl-guard-m-${suffix}.example.com/page`,
          markdown: ENGLISH,
        }),
        insertLanguageDetectionCrawlForTest({
          hostname: `crawl-guard-g-${suffix}.example.com`,
          url: `https://crawl-guard-g-${suffix}.example.com/page`,
          markdown: GERMAN,
        }),
      ])
      const row = { ...PENDING, text: ENGLISH, title: null, markdown: ENGLISH, language: null }
      return {
        matchingId,
        guardedOutId,
        batch: {
          table: 'crawls',
          rows: [
            { id: matchingId, ...row },
            { id: guardedOutId, ...row },
          ],
        },
      }
    },
  },
  {
    table: 'communities',
    setup: async user => {
      const suffix = createRandomString(10)
      const [matchingId, guardedOutId] = await Promise.all([
        insertLanguageDetectionCommunityForTest({
          createdById: user.id,
          name: ENGLISH,
          slug: `comm-guard-m-${suffix}`,
        }),
        insertLanguageDetectionCommunityForTest({
          createdById: user.id,
          name: GERMAN,
          slug: `comm-guard-g-${suffix}`,
        }),
      ])
      const row = {
        ...PENDING,
        text: ENGLISH,
        name: ENGLISH,
        markdown: null,
        defaultLanguage: null,
      }
      return {
        matchingId,
        guardedOutId,
        batch: {
          table: 'communities',
          rows: [
            { id: matchingId, ...row },
            { id: guardedOutId, ...row },
          ],
        },
      }
    },
  },
  {
    table: 'users',
    cache: caches.users_public,
    setup: async () => {
      const suffix = createRandomString(10)
      const [matchingId, guardedOutId] = await Promise.all([
        insertLanguageDetectionUserForTest({
          username: `user-guard-m-${suffix}`,
          markdown: ENGLISH,
        }),
        insertLanguageDetectionUserForTest({ username: `user-guard-g-${suffix}`, markdown: '' }),
      ])
      return {
        matchingId,
        guardedOutId,
        batch: {
          table: 'users',
          rows: [
            { ...PENDING, id: matchingId, text: ENGLISH, markdown: ENGLISH },
            // DB holds '' while the batch row carries null; strict IS NOT DISTINCT FROM skips it.
            { ...PENDING, id: guardedOutId, text: '', markdown: null },
          ],
        },
      }
    },
  },
  {
    table: 'topics',
    cache: caches.topics,
    setup: async user => {
      const suffix = createRandomString(10)
      const matchingName = `${ENGLISH} ${randomDigits()}`
      const [matchingId, guardedOutId] = await Promise.all([
        insertLanguageDetectionTopicForTest({
          createdById: user.id,
          name: matchingName,
          slug: `topic-guard-m-${suffix}`,
        }),
        insertLanguageDetectionTopicForTest({
          createdById: user.id,
          name: `${GERMAN} ${randomDigits()}`,
          slug: `topic-guard-g-${suffix}`,
        }),
      ])
      return {
        matchingId,
        guardedOutId,
        batch: {
          table: 'topics',
          rows: [
            { ...PENDING, id: matchingId, text: matchingName, name: matchingName, markdown: '' },
            { ...PENDING, id: guardedOutId, text: ENGLISH, name: ENGLISH, markdown: '' },
          ],
        },
      }
    },
  },
]

describe('runBatch per-row guards and batched invalidation', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it.each(guardCases)(
    '$table updates the matching row and leaves the guarded-out row unchanged and cached',
    async ({ table, cache, setup }) => {
      const { matchingId, guardedOutId, batch } = await setup(user)
      if (cache) {
        await Promise.all([
          cache.set(matchingId, { sentinel: 'matching' }),
          cache.set(guardedOutId, GUARDED_SENTINEL),
        ])
      }
      try {
        expect(await runBatch(batch)).toEqual({ updated: 1 })

        const updated = await getLanguageDetectionStateForTest(table, matchingId)
        expect(updated.lingua_rs_detected_language).toBe('en')
        expect(updated.lingua_rs_input_sha256).toHaveLength(32)
        expect(updated.lingua_rs_detected_at).toBeInstanceOf(Date)

        const skipped = await getLanguageDetectionStateForTest(table, guardedOutId)
        expect(skipped.lingua_rs_detected_language).toBeNull()
        expect(skipped.lingua_rs_input_sha256).toBeNull()
        expect(skipped.lingua_rs_detected_at).toBeNull()

        const cacheValues = cache
          ? await Promise.all([cache.get(matchingId), cache.get(guardedOutId)])
          : null
        expect(cacheValues).toEqual(cache ? [null, GUARDED_SENTINEL] : null)
      } finally {
        if (cache) await cache.delete(matchingId, guardedOutId)
      }
    },
  )
})
