import type { ReadStream } from 'node:fs'
import { rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BedrockControlClient } from '@modules/aws/bedrock-control'
import { S3BedrockBatchBucket, S3BedrockBatchClient } from '@modules/aws/s3-bedrock-batch'
import { getDateFromUUIDv7 } from '@modules/utils/ids'
import { createCrawlChunkEntityId } from '@services/bedrock-embeddings-batch/entities/crawl-chunk-entity-id'
import type { BatchJobType } from '@services/bedrock-embeddings/batch/types'
import {
  getTestBatchEntities,
  getTestBatchSummary,
} from '@voucha/test-helpers/entities/bedrock-embeddings-batches'
import {
  createTestUrlWithHostname,
  createTestBatch,
  createTestUserDirect,
  insertTestCrawl,
  insertTestCrawlChunk,
  insertTestImage,
  insertTestPost,
  insertTestRssFeed,
  insertTestRssFeedItem,
  insertTestTopic,
} from '@voucha/test-helpers'
import { createBatch } from './create.mts'

vi.mock<typeof import('@modules/aws/s3-bedrock-batch')>(
  import('@modules/aws/s3-bedrock-batch'),
  async importOriginal => ({
    ...(await importOriginal<typeof import('@modules/aws/s3-bedrock-batch')>()),
    S3BedrockBatchClient: {
      send: vi.fn<VitestLooseMock>(),
    } as unknown as typeof import('@modules/aws/s3-bedrock-batch').S3BedrockBatchClient,
  }),
)

vi.mock<typeof import('@modules/aws/bedrock-control')>(
  import('@modules/aws/bedrock-control'),
  async importOriginal => ({
    ...(await importOriginal<typeof import('@modules/aws/bedrock-control')>()),
    BedrockControlClient: {
      send: vi.fn<VitestLooseMock>(),
    } as unknown as typeof import('@modules/aws/bedrock-control').BedrockControlClient,
  }),
)

const tempFiles: string[] = []

describe('createBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('BEDROCK_BATCH_ROLE_ARN', 'arn:aws:iam::123456789012:role/test-bedrock-role')
    vi.stubEnv('ENVIRONMENT', 'staging')
    vi.mocked(S3BedrockBatchClient.send).mockResolvedValue(undefined as never)
    vi.mocked(BedrockControlClient.send).mockResolvedValue({
      jobArn: `arn:aws:bedrock:us-west-2:123456789012:model-invocation-job/${randomUUID()}`,
    } as never)
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await Promise.all(tempFiles.splice(0).map(path => rm(path, { force: true })))
  })

  it.each([['topics'], ['posts'], ['rss_feed_items'], ['crawl_chunks'], ['images']] as const)(
    'inserts typed FK lock rows for %s batches',
    async jobType => {
      const user = await createTestUserDirect()
      const entityIds = [await createLockedEntityId(jobType, user.id)]
      const inputFile = await writeTempFile('input.jsonl', 'irrelevant for this test')
      const entityIdsFile = await writeTempFile(
        'entity-ids.csv',
        entityIds.map(id => `${id}\n`).join(''),
      )

      const batchId = await createBatch(inputFile, jobType, entityIds.length, entityIdsFile)

      expect(getDateFromUUIDv7(batchId)).toBeInstanceOf(Date)
      expect(await getTestBatchEntities(batchId)).toEqual([
        {
          entity_type: jobType,
          entity_id: entityIds[0],
        },
      ])
      expect(await getTestBatchSummary(batchId)).toEqual({
        job_type: jobType,
        status: 'submitted',
      })
    },
  )

  it('deduplicates repeated entity IDs before inserting lock rows', async () => {
    const user = await createTestUserDirect()
    const entityId = await createLockedEntityId('topics', user.id)
    const inputFile = await writeTempFile('input.jsonl', 'irrelevant for this test')
    const entityIdsFile = await writeTempFile('entity-ids.csv', `${entityId}\n${entityId}\n`)

    const batchId = await createBatch(inputFile, 'topics', 2, entityIdsFile)

    expect(await getTestBatchEntities(batchId)).toEqual([
      { entity_type: 'topics', entity_id: entityId },
    ])
  })

  it('closes the upload input stream when the S3 client returns without consuming it', async () => {
    const user = await createTestUserDirect()
    const entityId = await createLockedEntityId('topics', user.id)
    const inputFile = await writeTempFile('input.jsonl', 'irrelevant for this test')
    const entityIdsFile = await writeTempFile('entity-ids.csv', `${entityId}\n`)

    const batchId = await createBatch(inputFile, 'topics', 1, entityIdsFile)

    expect(S3BedrockBatchClient.send).toHaveBeenCalledOnce()
    const putObjectCommand = vi.mocked(S3BedrockBatchClient.send).mock.calls[0]?.[0] as
      | { input?: { Body?: ReadStream; Bucket?: string; Key?: string } }
      | undefined

    expect(putObjectCommand?.input?.Body?.closed).toBe(true)
    expect(putObjectCommand?.input?.Body?.destroyed).toBe(true)
    expect(putObjectCommand?.input?.Bucket).toBe(S3BedrockBatchBucket)
    expect(putObjectCommand?.input?.Key).toBe(`bedrock-embeddings-input/${batchId}/input.jsonl`)

    const jobCommand = vi.mocked(BedrockControlClient.send).mock.calls[0]?.[0] as
      | {
          input?: {
            jobName?: string
            inputDataConfig?: { s3InputDataConfig?: { s3Uri?: string } }
            outputDataConfig?: { s3OutputDataConfig?: { s3Uri?: string } }
          }
        }
      | undefined
    expect(jobCommand?.input?.jobName).toBe(`voucha-staging-${batchId}`)
    expect(jobCommand?.input?.inputDataConfig?.s3InputDataConfig?.s3Uri).toBe(
      `s3://${S3BedrockBatchBucket}/bedrock-embeddings-input/${batchId}/input.jsonl`,
    )
    expect(jobCommand?.input?.outputDataConfig?.s3OutputDataConfig?.s3Uri).toBe(
      `s3://${S3BedrockBatchBucket}/bedrock-embeddings-output/${batchId}/`,
    )
  })

  it('fails before side effects when ENVIRONMENT is not an explicit routing environment', async () => {
    vi.stubEnv('ENVIRONMENT', 'prodution')
    const inputFile = await writeTempFile('input.jsonl', 'irrelevant for this test')
    const entityIdsFile = await writeTempFile('entity-ids.csv', `${randomUUID()}\n`)

    await expect(createBatch(inputFile, 'topics', 1, entityIdsFile)).rejects.toThrow(
      'ENVIRONMENT must be development, test, staging, or production',
    )

    expect(S3BedrockBatchClient.send).not.toHaveBeenCalled()
    expect(BedrockControlClient.send).not.toHaveBeenCalled()
  })

  it('fails instead of partially acquiring locks when another batch already locked an entity', async () => {
    const user = await createTestUserDirect()
    const entityId = await createLockedEntityId('topics', user.id)
    const { batchId: existingBatchId } = await createTestBatch({
      entityIds: [entityId],
      jobType: 'topics',
    })
    const inputFile = await writeTempFile('input.jsonl', 'irrelevant for this test')
    const entityIdsFile = await writeTempFile('entity-ids.csv', `${entityId}\n`)

    await expect(createBatch(inputFile, 'topics', 1, entityIdsFile)).rejects.toThrow(
      'duplicate key value violates unique constraint',
    )

    expect(await getTestBatchEntities(existingBatchId)).toEqual([
      { entity_type: 'topics', entity_id: entityId },
    ])
    expect(S3BedrockBatchClient.send).not.toHaveBeenCalled()
    expect(BedrockControlClient.send).not.toHaveBeenCalled()
  })
})

async function createLockedEntityId(jobType: BatchJobType, userId: string): Promise<string> {
  const suffix = randomUUID().slice(0, 8)
  switch (jobType) {
    case 'topics':
      return await insertTestTopic({
        name: `Batch Lock ${suffix}`,
        slug: `batch-lock-${suffix}`,
        createdById: userId,
      })
    case 'posts':
      return await insertTestPost({
        title: `Batch Lock ${suffix}`,
        slug: `batch-lock-post-${suffix}`,
        markdown: 'Post body',
        createdById: userId,
      })
    case 'rss_feed_items': {
      const topicId = await createLockedEntityId('topics', userId)
      const feedId = await insertTestRssFeed({ topicId, title: `Batch Lock Feed ${suffix}` })
      const urlId = await createTestUrlWithHostname()
      return await insertTestRssFeedItem({
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
        orderIndex: 0,
        markdown: 'Chunk markdown',
        contentSha256: Buffer.from('2'.repeat(64), 'hex'),
      })
      return createCrawlChunkEntityId(crawl.id, 0)
    }
    case 'images':
      return await insertTestImage(userId)
  }
}

async function writeTempFile(name: string, contents: string): Promise<string> {
  const filePath = join(tmpdir(), `bedrock-create-test-${randomUUID()}-${name}`)
  await writeFile(filePath, contents)
  tempFiles.push(filePath)
  return filePath
}
