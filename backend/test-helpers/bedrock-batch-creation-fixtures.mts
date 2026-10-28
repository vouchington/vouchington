import { randomUUID } from 'node:crypto'
import { rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { onTestFinished } from 'vitest'
import type { BatchJobType } from '../services/bedrock-embeddings/batch/types.mts'
import { createCrawlChunkEntityId } from '../services/bedrock-embeddings-batch/entities/crawl-chunk-entity-id.mts'
import {
  createTestUrlWithHostname,
  insertTestCrawl,
  insertTestCrawlChunk,
  insertTestImage,
  insertTestPost,
  insertTestRssFeed,
  insertTestRssFeedItem,
  insertTestTopic,
} from './entities/index.mts'

export async function createLockedEntityId(
  jobType: BatchJobType,
  userId: string,
  orderIndex = 0,
): Promise<string> {
  const suffix = randomUUID().slice(0, 8)
  switch (jobType) {
    case 'topics':
      return insertTestTopic({
        name: `Batch Lock ${suffix}`,
        slug: `batch-lock-${suffix}`,
        createdById: userId,
      })
    case 'posts':
      return insertTestPost({
        title: `Batch Lock ${suffix}`,
        slug: `batch-lock-post-${suffix}`,
        markdown: 'Post body',
        createdById: userId,
      })
    case 'rss_feed_items': {
      const topicId = await createLockedEntityId('topics', userId)
      const feedId = await insertTestRssFeed({ topicId, title: `Batch Lock Feed ${suffix}` })
      const urlId = await createTestUrlWithHostname()
      return insertTestRssFeedItem({
        rssFeedId: feedId,
        urlId,
        guid: `batch-lock-${suffix}`,
        itemData: { title: 'RSS item' },
        contentSha256: Buffer.from('1'.repeat(64), 'hex'),
      })
    }
    case 'crawl_chunks': {
      const urlId = await createTestUrlWithHostname()
      const crawl = await insertTestCrawl({
        urlId,
        statusCode: 200,
        markdown: 'Crawl markdown',
      })
      await insertTestCrawlChunk({
        urlId,
        crawlId: crawl.id,
        orderIndex,
        markdown: 'Chunk markdown',
        contentSha256: Buffer.from('2'.repeat(64), 'hex'),
      })
      return createCrawlChunkEntityId(crawl.id, orderIndex)
    }
    case 'images':
      return insertTestImage(userId)
  }
}

/** Each owned file is removed even when submission rejects before its normal cleanup. */
export async function writeBatchFixtureFile(name: string, contents: string): Promise<string> {
  const filePath = join(tmpdir(), `bedrock-create-test-${randomUUID()}-${name}`)
  onTestFinished(() => rm(filePath, { force: true }))
  await writeFile(filePath, contents)
  return filePath
}
