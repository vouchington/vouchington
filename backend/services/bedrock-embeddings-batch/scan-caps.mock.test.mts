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
    for (let index = 0; index < 4; index++) ids.push(await insertTestImage(owner.id))
    overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, {
      min_records_per_job: 2,
      max_scan_rows_per_run: 2,
      image_cursor_batch_size: 1,
      max_requests_per_file: 2,
    })
    vi.stubEnv('BEDROCK_BATCH_ROLE_ARN', 'arn:aws:iam::123456789012:role/test-bedrock-role')
    vi.stubEnv('ENVIRONMENT', 'staging')
    vi.mocked(S3ImagesClient.send).mockImplementation(
      async () => ({ Body: Readable.from([Buffer.from('invalid-image')]) }) as never,
    )
    vi.mocked(S3BedrockBatchClient.send).mockResolvedValue(undefined as never)
    vi.mocked(BedrockControlClient.send).mockResolvedValue({
      jobArn: `arn:aws:bedrock:us-west-2:123456789012:model-invocation-job/${randomUUID()}`,
    } as never)
    let continuation: EmbeddingScanCursor | undefined
    const run = (cursor?: EmbeddingScanCursor) =>
      processImageBatchCreation({
        streamPending: options => streamPendingImages({ ...options, cursor }),
        addImageToBatch,
        reEnqueue: next => {
          continuation = next
        },
      })
    expect(await run()).toMatchObject({ failed: true, attempted: 2, hasMore: true })
    expect(continuation?.afterId).toBe(ids[2])
    expect(BedrockControlClient.send).not.toHaveBeenCalled()
    vi.mocked(S3ImagesClient.send).mockImplementation(
      async () => ({ Body: Readable.from([gif]) }) as never,
    )
    expect(await run(continuation)).toMatchObject({ success: true })
    const command = vi.mocked(BedrockControlClient.send).mock.calls[0]![0] as {
      input: { jobName: string }
    }
    const batchId = command.input.jobName.replace('voucha-staging-', '')
    const entities = await getTestBatchEntities(batchId)
    expect(entities.map(row => row.entity_id).toSorted()).toEqual(ids.slice(0, 2).toSorted())
    vi.mocked(S3ImagesClient.send).mockImplementation(
      async () => ({ Body: Readable.from([Buffer.from('invalid-image')]) }) as never,
    )
    expect(await run()).toMatchObject({ failed: true, attempted: 2, hasMore: true })
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
