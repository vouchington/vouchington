import { Readable } from 'node:stream'
import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestUser, insertTestImage } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { getTestBatchEntities } from '@voucha/test-helpers/entities/bedrock-embeddings-batches'
import { S3ImagesClient } from '@modules/aws'
import { S3BedrockBatchClient } from '@modules/aws/s3-bedrock-batch'
import { BedrockControlClient } from '@modules/aws/bedrock-control'
import { bedrockEmbeddingsBatchConfig } from '@services/bedrock-embeddings/batch/config'
import type { EmbeddingScanCursor } from '@queues/bedrock-embeddings-batch/types'
import { getDynamicConfigRegistryEntry } from '../dynamic-config-admin/registry.mts'
import { processImageBatchCreation } from './utils.mts'
import { addImageToBatch, streamPendingImages } from './entities/images.mts'

vi.mock<typeof import('@modules/aws')>(import('@modules/aws'), async original => ({
  ...(await original()),
  S3ImagesClient: { send: vi.fn<VitestLooseMock>() } as unknown as typeof S3ImagesClient,
}))
vi.mock<typeof import('@modules/aws/s3-bedrock-batch')>(
  import('@modules/aws/s3-bedrock-batch'),
  async original => ({
    ...(await original()),
    S3BedrockBatchClient: {
      send: vi.fn<VitestLooseMock>(),
    } as unknown as typeof S3BedrockBatchClient,
  }),
)
vi.mock<typeof import('@modules/aws/bedrock-control')>(
  import('@modules/aws/bedrock-control'),
  async original => ({
    ...(await original()),
    BedrockControlClient: {
      send: vi.fn<VitestLooseMock>(),
    } as unknown as typeof BedrockControlClient,
  }),
)

const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64')

describe('embedding scan caps', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it('continues past poison images and submits the healthy tail at the minimum boundary', async () => {
    const owner = await createTestUser()
    const ids: string[] = []
    for (let index = 0; index < 3; index++) ids.push(await insertTestImage(owner.id))
    overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, {
      min_records_per_job: 2,
      max_scan_rows_per_run: 2,
      image_cursor_batch_size: 1,
      max_requests_per_file: 2,
    })
    vi.stubEnv('BEDROCK_BATCH_ROLE_ARN', 'arn:aws:iam::123456789012:role/test-bedrock-role')
    vi.stubEnv('ENVIRONMENT', 'staging')
    vi.mocked(S3ImagesClient.send).mockImplementation(
      async () => ({ Body: Readable.from([gif]) }) as never,
    )
    vi.mocked(S3ImagesClient.send).mockImplementationOnce(
      async () => ({ Body: Readable.from([Buffer.from('invalid-image')]) }) as never,
    )
    vi.mocked(S3BedrockBatchClient.send).mockResolvedValue(undefined as never)
    vi.mocked(BedrockControlClient.send).mockResolvedValue({
      jobArn: `arn:aws:bedrock:us-west-2:123456789012:model-invocation-job/${randomUUID()}`,
    } as never)
    let continuation: EmbeddingScanCursor | undefined
    const run = (cursor?: EmbeddingScanCursor) =>
      processImageBatchCreation({
        cursor,
        streamPending: options => streamPendingImages({ ...options, cursor }),
        addImageToBatch,
        reEnqueue: next => {
          continuation = next
        },
      })
    expect(await run()).toMatchObject({ empty: true, hasMore: true })
    expect(continuation?.afterId).toBe(ids[1])
    expect(continuation?.pendingImageIds).toEqual([ids[1]])
    expect(BedrockControlClient.send).not.toHaveBeenCalled()
    vi.mocked(S3ImagesClient.send).mockImplementation(
      async () => ({ Body: Readable.from([gif]) }) as never,
    )
    vi.mocked(S3ImagesClient.send).mockClear()
    expect(await run(continuation)).toMatchObject({ success: true })
    expect(S3ImagesClient.send).toHaveBeenCalledTimes(2)
    const command = vi.mocked(BedrockControlClient.send).mock.calls[0]![0] as {
      input: { jobName: string }
    }
    const batchId = command.input.jobName.replace('voucha-staging-', '')
    const entities = await getTestBatchEntities(batchId)
    expect(entities.map(row => row.entity_id).toSorted()).toEqual(ids.slice(0, 2).toSorted())
    vi.mocked(S3ImagesClient.send).mockImplementation(
      async () => ({ Body: Readable.from([Buffer.from('invalid-image')]) }) as never,
    )
    expect(await run()).toMatchObject({ failed: true })
  })

  it('drains carried IDs under a smaller next-run budget without dropping the tail', async () => {
    const owner = await createTestUser()
    const ids: string[] = []
    for (let index = 0; index < 4; index++) ids.push(await insertTestImage(owner.id))
    overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, {
      min_records_per_job: 3,
      max_scan_rows_per_run: 3,
      image_cursor_batch_size: 1,
      max_requests_per_file: 3,
    })
    vi.stubEnv('BEDROCK_BATCH_ROLE_ARN', 'arn:aws:iam::123456789012:role/test-bedrock-role')
    vi.stubEnv('ENVIRONMENT', 'staging')
    vi.mocked(S3ImagesClient.send).mockImplementation(
      async () => ({ Body: Readable.from([gif]) }) as never,
    )
    vi.mocked(S3ImagesClient.send).mockImplementationOnce(
      async () => ({ Body: Readable.from([Buffer.from('invalid-image')]) }) as never,
    )
    vi.mocked(S3BedrockBatchClient.send).mockResolvedValue(undefined as never)
    vi.mocked(BedrockControlClient.send).mockImplementation(
      async () =>
        ({
          jobArn: `arn:aws:bedrock:us-west-2:123456789012:model-invocation-job/${randomUUID()}`,
        }) as never,
    )
    let continuation: EmbeddingScanCursor | undefined
    const run = (cursor?: EmbeddingScanCursor) =>
      processImageBatchCreation({
        cursor,
        streamPending: options => streamPendingImages({ ...options, cursor }),
        addImageToBatch,
        reEnqueue: next => {
          continuation = next
        },
      })
    expect(await run()).toMatchObject({ empty: true, hasMore: true })
    expect(continuation?.pendingImageIds).toEqual([ids[2], ids[1]])
    overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, {
      min_records_per_job: 1,
      max_scan_rows_per_run: 1,
      max_requests_per_file: 1,
    })
    for (const id of ids.slice(0, 3).toReversed()) {
      vi.mocked(S3ImagesClient.send).mockClear()
      expect(await run(continuation)).toMatchObject({ success: true, hasMore: true })
      expect(S3ImagesClient.send).toHaveBeenCalledTimes(1)
      const command = vi.mocked(BedrockControlClient.send).mock.calls.at(-1)![0] as {
        input: { jobName: string }
      }
      const entities = await getTestBatchEntities(
        command.input.jobName.replace('voucha-staging-', ''),
      )
      expect(entities.map(row => row.entity_id)).toEqual([id])
    }
  })

  it('finishes a replay-only page at its row cap before reading fresh images', async () => {
    const owner = await createTestUser()
    const ids = [await insertTestImage(owner.id), await insertTestImage(owner.id)]
    let progress: { hasMore: boolean; cursor?: EmbeddingScanCursor } = { hasMore: false }
    const run = async (cursor: EmbeddingScanCursor) => {
      const seen: string[] = []
      for await (const image of streamPendingImages({
        cursor,
        limits: { batchSize: 1, maxRows: 1 },
        onComplete: result => {
          progress = result
        },
      }))
        seen.push(image.id)
      return seen
    }
    const cursor: EmbeddingScanCursor = {
      sweepStartedAt: new Date(Date.now() + 1000).toISOString(),
      afterId: '00000000-0000-7000-8000-000000000001',
      pendingImageIds: ids,
    }
    expect(await run(cursor)).toEqual([ids[1]])
    expect(progress).toMatchObject({ hasMore: true, cursor: { pendingImageIds: [ids[0]] } })
    expect(await run(progress.cursor!)).toEqual([ids[0]])
    expect(progress).toMatchObject({ hasMore: true, cursor: { pendingImageIds: [] } })
    expect(await run(progress.cursor!)).toEqual([])
    expect(progress.hasMore).toBe(false)
  })

  it('rejects a scan cap below the minimum before file, cursor or provider work', async () => {
    const entry = getDynamicConfigRegistryEntry('bedrock-embeddings-batch-config')!
    expect(() =>
      entry.validate?.({
        ...bedrockEmbeddingsBatchConfig.defaultFields,
        min_records_per_job: 2,
        max_scan_rows_per_run: 1,
      }),
    ).toThrow('must be >= min_records_per_job')
    overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, {
      min_records_per_job: 2,
      max_scan_rows_per_run: 1,
    })
    const streamPending = vi.fn<typeof streamPendingImages>()
    await expect(
      processImageBatchCreation({ streamPending, addImageToBatch, reEnqueue: () => {} }),
    ).rejects.toThrow('scan budget')
    expect(streamPending).not.toHaveBeenCalled()
    expect(S3ImagesClient.send).not.toHaveBeenCalled()
    expect(BedrockControlClient.send).not.toHaveBeenCalled()
  })
})
