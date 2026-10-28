import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BedrockControlClient } from '@modules/aws/bedrock-control'
import { S3BedrockBatchClient } from '@modules/aws/s3-bedrock-batch'
import { createTestBatch, createTestUserDirect } from '@voucha/test-helpers'
import { getTestBatchEntities } from '@voucha/test-helpers/entities/bedrock-embeddings-batches'
import {
  createLockedEntityId,
  writeBatchFixtureFile as writeTempFile,
} from '@voucha/test-helpers/bedrock-batch-creation-fixtures'
import { createBatch as submitBatch } from '../create.mts'

const createBatch = (file: string, count: number, ids: string) =>
  submitBatch(
    file,
    'topics',
    count,
    ids,
    undefined,
    undefined,
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
describe('batch admission after fixture creation', () => {
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

  it('admits production work after an empty default fixture creates no locks', async () => {
    const user = await createTestUserDirect()
    const entityId = await createLockedEntityId('topics', user.id)
    const { batchId: emptyBatchId } = await createTestBatch()
    expect(await getTestBatchEntities(emptyBatchId)).toEqual([])
    const inputFile = await writeTempFile('input.jsonl', 'irrelevant for this test')
    const entityIdsFile = await writeTempFile('entity-ids.csv', `${entityId}\n`)
    const batchId = await createBatch(inputFile, 1, entityIdsFile)
    expect(await getTestBatchEntities(batchId)).toEqual([
      { entity_type: 'topics', entity_id: entityId },
    ])
    expect(S3BedrockBatchClient.send).toHaveBeenCalledTimes(1)
    expect(BedrockControlClient.send).toHaveBeenCalledTimes(1)
  })

  it('admits production work after duplicate fixture IDs fail without partial locks', async () => {
    const user = await createTestUserDirect()
    const entityId = await createLockedEntityId('topics', user.id)
    await expect(createTestBatch({ entityIds: [entityId, entityId] })).rejects.toMatchObject({
      code: '23505',
    })
    const inputFile = await writeTempFile('input.jsonl', 'irrelevant for this test')
    const entityIdsFile = await writeTempFile('entity-ids.csv', `${entityId}\n`)
    const batchId = await createBatch(inputFile, 1, entityIdsFile)
    expect(await getTestBatchEntities(batchId)).toEqual([
      { entity_type: 'topics', entity_id: entityId },
    ])
    expect(S3BedrockBatchClient.send).toHaveBeenCalledTimes(1)
    expect(BedrockControlClient.send).toHaveBeenCalledTimes(1)
  })
})
