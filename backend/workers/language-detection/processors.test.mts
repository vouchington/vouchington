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
    const jobs: LanguageDetectionBackfillJobName[] = [
      'backfill_posts',
      'backfill_rss_feed_items',
      'backfill_crawls',
      'backfill_communities',
      'backfill_users',
      'backfill_topics',
    ]

    for (const job of jobs) {
      await expect(processLanguageDetectionBackfill(job)).resolves.toMatchObject({
        updated: expect.any(Number),
      })
    }
  })

  it('backfills non-post entities through the batch processor path', async () => {
    const random = createRandomString(10)
    const userId = await insertLanguageDetectionUserForTest({
      username: `language-backfill-user-${random}`,
      markdown:
        'This backfilled user profile is written in English with clear sentences, common vocabulary, and enough context for reliable language detection by the worker processor.',
    })

    const result = await processLanguageDetectionBackfill('backfill_users')

    expect(result.updated).toBeGreaterThan(0)
    const state = await getLanguageDetectionStateForTest('users', userId)
    expect(state.lingua_rs_detected_language).toBe('en')
    expect(state.lingua_rs_input_sha256).toBeInstanceOf(Buffer)
    expect(state.lingua_rs_detected_at).toBeInstanceOf(Date)
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
