import {
  createLockedEntityId,
  writeBatchFixtureFile as writeTempFile,
} from '@voucha/test-helpers/bedrock-batch-creation-fixtures'
import type { ReadStream } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { StopModelInvocationJobCommand } from '@aws-sdk/client-bedrock'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BedrockControlClient } from '@modules/aws/bedrock-control'
import { S3BedrockBatchBucket, S3BedrockBatchClient } from '@modules/aws/s3-bedrock-batch'
import { getDateFromUUIDv7, mintUUIDv7 } from '@modules/utils/ids'
import type { BatchJobType } from '@services/bedrock-embeddings/batch/types'
import {
  getTestBatchEntities,
  getTestBatchSourceColumns,
  getTestBatchSummary,
  insertTestEmbeddingsBatch,
} from '@voucha/test-helpers/entities/bedrock-embeddings-batches'
import {
  createTestUrlWithHostname,
  createTestBatch,
  createTestUserDirect,
  insertTestCrawl,
} from '@voucha/test-helpers'
import { createBatch as submitBatch } from './create.mts'

const createBatch = (
  file: string,
  type: BatchJobType,
  count: number,
  ids: string,
  metadata?: Parameters<typeof submitBatch>[4],
  source?: Parameters<typeof submitBatch>[5],
) =>
  submitBatch(
    file,
    type,
    count,
    ids,
    metadata,
    source,
    async () => {},
    () => true,
  )

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
  afterEach(() => {
    vi.unstubAllEnvs()
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
  it('stores the source url and crawl only in their foreign-key columns', async () => {
    const user = await createTestUserDirect()
    const entityId = await createLockedEntityId('topics', user.id)
    const urlId = await createTestUrlWithHostname()
    const crawl = await insertTestCrawl({ urlId, statusCode: 200, markdown: 'Crawl markdown' })
    const inputFile = await writeTempFile('input.jsonl', 'irrelevant for this test')
    const entityIdsFile = await writeTempFile('entity-ids.csv', `${entityId}\n`)
    const batchId = await createBatch(
      inputFile,
      'topics',
      1,
      entityIdsFile,
      { inputSizeMB: 2 },
      { urlId, crawlId: crawl.id },
    )

    expect(await getTestBatchSourceColumns(batchId)).toEqual({
      url_id: urlId,
      crawl_id: crawl.id,
      metadata: { inputSizeMB: 2 },
    })
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

  it.each(['topics', 'posts', 'rss_feed_items', 'crawl_chunks', 'images'] as const)(
    'fails before submission when a fixture batch already holds multiple %s locks',
    async jobType => {
      const user = await createTestUserDirect()
      const entityIds = [
        await createLockedEntityId(jobType, user.id, 12),
        await createLockedEntityId(jobType, user.id, 3),
      ]
      const { batchId: existingBatchId } = await createTestBatch({ entityIds, jobType, records: 0 })
      const inputFile = await writeTempFile('input.jsonl', 'irrelevant for this test')
      const entityIdsFile = await writeTempFile(
        'entity-ids.csv',
        entityIds.map(id => `${id}\n`).join(''),
      )

      await expect(
        createBatch(inputFile, jobType, entityIds.length, entityIdsFile),
      ).rejects.toThrow('duplicate key value violates unique constraint')
      expect(await getTestBatchEntities(existingBatchId)).toEqual(
        entityIds.toSorted().map(entityId => ({ entity_type: jobType, entity_id: entityId })),
      )
      expect(S3BedrockBatchClient.send).not.toHaveBeenCalled()
      expect(BedrockControlClient.send).not.toHaveBeenCalled()
    },
  )

  it('keeps the persisted batch when stopping the submitted job also fails', async () => {
    const user = await createTestUserDirect()
    const entityId = await createLockedEntityId('topics', user.id)
    const jobArn = `arn:aws:bedrock:us-west-2:123456789012:model-invocation-job/${randomUUID()}`
    await insertTestEmbeddingsBatch({
      id: mintUUIDv7(),
      bedrockStatus: 'Submitted',
      jobArn,
    })
    vi.mocked(BedrockControlClient.send)
      .mockResolvedValueOnce({ jobArn } as never)
      .mockRejectedValueOnce(new Error('stop failed'))
    const inputFile = await writeTempFile('input.jsonl', 'irrelevant for this test')
    const entityIdsFile = await writeTempFile('entity-ids.csv', `${entityId}\n`)

    await expect(createBatch(inputFile, 'topics', 1, entityIdsFile)).rejects.toThrow(
      'idx_bedrock_embedding_batches__job_arn',
    )

    expect(BedrockControlClient.send).toHaveBeenCalledTimes(2)
    expect(vi.mocked(BedrockControlClient.send).mock.calls[1]?.[0]).toBeInstanceOf(
      StopModelInvocationJobCommand,
    )

    const retryInputFile = await writeTempFile('input.jsonl', 'irrelevant for this test')
    const retryEntityIdsFile = await writeTempFile('entity-ids.csv', `${entityId}\n`)
    await expect(createBatch(retryInputFile, 'topics', 1, retryEntityIdsFile)).rejects.toThrow(
      'duplicate key value violates unique constraint',
    )
    expect(BedrockControlClient.send).toHaveBeenCalledTimes(2)
  })
})
