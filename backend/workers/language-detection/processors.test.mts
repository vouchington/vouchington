import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { addUrl } from '@services/urls'
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
import type {
  LanguageDetectionBackfillJobName,
  LanguageDetectionEntityType,
} from '@queues/language-detection/types'
import { processLanguageDetection, processLanguageDetectionBackfill } from './processors.mts'

describe('language detection processors', () => {
  async function createRssFeedItemForLanguageDetection(): Promise<string> {
    const random = createRandomString(10)
    const topic = await createTestTopic()
    const feedId = await insertTestRssFeed({ topicId: topic.id, title: `Feed ${random}` })
    const url = await addUrl(null, `https://rss-processor-${random}.example.com/item`)
    expect(url).toBeTruthy()
    return insertTestRssFeedItem({
      rssFeedId: feedId,
      urlId: url!.id,
      guid: `language-processor-${random}`,
      itemData: {
        title: `English language detection sample article ${random}`,
        contentSnippet:
          'This feed item is written entirely in English. It describes a simple news article with clear sentences, common vocabulary, and enough surrounding context for reliable language detection.',
      },
      contentSha256: Buffer.alloc(32, 0),
    })
  }

  async function expectEnglishDetection(
    entityType: LanguageDetectionEntityType,
    table: Parameters<typeof getLanguageDetectionStateForTest>[0],
    id: string,
  ): Promise<void> {
    await processLanguageDetection(entityType, id)

    const state = await getLanguageDetectionStateForTest(table, id)
    expect(state.lingua_rs_detected_language).toBe('en')
    expect(state.lingua_rs_input_sha256).toBeInstanceOf(Buffer)
    expect(state.lingua_rs_detected_at).toBeInstanceOf(Date)
  }

  it('detects and persists language for post jobs', async () => {
    const user = await createTestUser()
    expect(user).toBeTruthy()
    const postId = await insertLanguageDetectionPostForTest({
      createdById: user!.id,
      markdown:
        'This post is written in English with clear sentences, common vocabulary, and enough context for reliable language detection by the worker processor.',
      title: `Language detection ${randomUUID()}`,
    })

    await processLanguageDetection('post', postId)

    const state = await getLanguageDetectionStateForTest('posts', postId)
    expect(state.lingua_rs_detected_language).toBe('en')
    expect(state.lingua_rs_input_sha256).toBeInstanceOf(Buffer)
    expect(state.lingua_rs_detected_at).toBeInstanceOf(Date)
  })

  it('dispatches rss_feed_item jobs to RSS feed item language detection', async () => {
    const itemId = await createRssFeedItemForLanguageDetection()

    await expectEnglishDetection('rss_feed_item', 'rss_feed_items', itemId)
  })

  it('dispatches crawl jobs to crawl language detection', async () => {
    const random = createRandomString(10)
    const crawlId = await insertLanguageDetectionCrawlForTest({
      hostname: `crawl-language-${random}.example.com`,
      url: `https://crawl-language-${random}.example.com/page`,
      title: 'English crawl language detection sample',
      markdown:
        'This crawled page is written in English with clear sentences, common vocabulary, and enough context for reliable language detection by the worker processor.',
    })

    await expectEnglishDetection('crawl', 'crawls', crawlId)
  })

  it('dispatches community jobs to community language detection', async () => {
    const user = await createTestUser()
    expect(user).toBeTruthy()
    const random = createRandomString(10)
    const communityId = await insertLanguageDetectionCommunityForTest({
      createdById: user!.id,
      name: `Clear English community words ${random}`,
      slug: `english-language-community-${random}`,
      defaultLanguage: 'en',
    })

    await expectEnglishDetection('community', 'communities', communityId)
  })

  it('dispatches user jobs to user language detection', async () => {
    const random = createRandomString(10)
    const userId = await insertLanguageDetectionUserForTest({
      username: `language-user-${random}`,
      markdown:
        'This user profile is written in English with clear sentences, common vocabulary, and enough context for reliable language detection by the worker processor.',
    })

    await expectEnglishDetection('user', 'users', userId)
  })

  it('dispatches topic jobs to topic language detection', async () => {
    const user = await createTestUser()
    expect(user).toBeTruthy()
    const random = createRandomString(10)
    const topicId = await insertLanguageDetectionTopicForTest({
      createdById: user!.id,
      name: `This topic is written in English with clear sentences, common vocabulary, and enough context for reliable language detection by the worker processor. Unique sample ${random}.`,
      slug: `english-language-topic-${random}`,
    })

    await expectEnglishDetection('topic', 'topics', topicId)
  })

  it('accepts every known language detection backfill job name', async () => {
    const owner = await createTestUser()
    const random = createRandomString(10)
    const text =
      'This English text has clear sentences, familiar vocabulary, and enough context for reliable language detection by the real batch processor.'
    const fixtures: Array<{
      job: LanguageDetectionBackfillJobName
      table: Parameters<typeof getLanguageDetectionStateForTest>[0]
      create: () => Promise<string>
    }> = [
      {
        job: 'backfill_posts',
        table: 'posts',
        create: () =>
          insertLanguageDetectionPostForTest({
            createdById: owner.id,
            title: `Backfill ${randomUUID()}`,
            markdown: text,
          }),
      },
      {
        job: 'backfill_rss_feed_items',
        table: 'rss_feed_items',
        create: createRssFeedItemForLanguageDetection,
      },
      {
        job: 'backfill_crawls',
        table: 'crawls',
        create: () => {
          const hostname = `backfill-${randomUUID()}.example.com`
          return insertLanguageDetectionCrawlForTest({
            hostname,
            url: `https://${hostname}/page`,
            markdown: text,
          })
        },
      },
      {
        job: 'backfill_communities',
        table: 'communities',
        create: () =>
          insertLanguageDetectionCommunityForTest({
            createdById: owner.id,
            name: 'Clear English community words for a reliable language detection sample',
            slug: `backfill-${randomUUID()}`,
          }),
      },
      {
        job: 'backfill_users',
        table: 'users',
        create: () =>
          insertLanguageDetectionUserForTest({
            username: `backfill-${random}-${randomUUID().slice(0, 8)}`,
            markdown: text,
          }),
      },
      {
        job: 'backfill_topics',
        table: 'topics',
        create: () =>
          insertLanguageDetectionTopicForTest({
            createdById: owner.id,
            name: `${text} ${randomUUID()}`,
            slug: `backfill-${randomUUID()}`,
          }),
      },
    ]
    for (const fixture of fixtures) {
      const ownedId = await fixture.create()
      const foreignId = await fixture.create()
      const foreignBefore = await getLanguageDetectionStateForTest(fixture.table, foreignId)
      expect(foreignBefore).toEqual({
        lingua_rs_detected_language: null,
        lingua_rs_input_sha256: null,
        lingua_rs_detected_at: null,
      })
      await expect(processLanguageDetectionBackfill(fixture.job, [ownedId])).resolves.toEqual({
        updated: 1,
      })
      const state = await getLanguageDetectionStateForTest(fixture.table, ownedId)
      expect(state.lingua_rs_detected_language).toBe('en')
      expect(state.lingua_rs_input_sha256).toBeInstanceOf(Buffer)
      expect(state.lingua_rs_detected_at).toBeInstanceOf(Date)
      await expect(getLanguageDetectionStateForTest(fixture.table, foreignId)).resolves.toEqual(
        foreignBefore,
      )
    }
  })

  it('backfills non-post entities through the batch processor path', async () => {
    const random = createRandomString(10)
    const userId = await insertLanguageDetectionUserForTest({
      username: `language-backfill-user-${random}`,
      markdown:
        'This backfilled user profile is written in English with clear sentences, common vocabulary, and enough context for reliable language detection by the worker processor.',
    })
    const foreignUserId = await insertLanguageDetectionUserForTest({
      username: `language-backfill-foreign-${random}`,
      markdown:
        'This foreign profile is also written in English and must stay undetected when the backfill lists only the owned user.',
    })

    const result = await processLanguageDetectionBackfill('backfill_users', [userId])

    expect(result.updated).toBeGreaterThan(0)
    const state = await getLanguageDetectionStateForTest('users', userId)
    expect(state.lingua_rs_detected_language).toBe('en')
    expect(state.lingua_rs_input_sha256).toBeInstanceOf(Buffer)
    expect(state.lingua_rs_detected_at).toBeInstanceOf(Date)
    await expect(getLanguageDetectionStateForTest('users', foreignUserId)).resolves.toMatchObject({
      lingua_rs_detected_language: null,
    })
  })

  it('ignores missing post rows', async () => {
    await expect(processLanguageDetection('post', randomUUID())).resolves.toBeUndefined()
  })

  it('rejects unknown language detection entity types', () => {
    expect(() =>
      processLanguageDetection('missing' as LanguageDetectionEntityType, randomUUID()),
    ).toThrow('Unknown language detection entity type: missing')
  })

  it('rejects unknown backfill jobs', async () => {
    await expect(processLanguageDetectionBackfill('backfill_missing' as never)).rejects.toThrow(
      'Unknown backfill job: backfill_missing',
    )
  })
})
