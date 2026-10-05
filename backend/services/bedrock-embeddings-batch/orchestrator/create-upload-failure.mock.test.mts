import { randomUUID } from 'node:crypto'
import { rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { PutObjectCommand } from '@aws-sdk/client-s3'
import { describe, expect, it, vi } from 'vitest'
import { BedrockControlClient } from '@modules/aws/bedrock-control'
import { S3BedrockBatchClient } from '@modules/aws/s3-bedrock-batch'
import { createTestUserDirect, insertTestTopic } from '@voucha/test-helpers'
import {
  getTestBatchEntities,
  getTestBatchSummary,
} from '@voucha/test-helpers/entities/bedrock-embeddings-batches'
import { createBatch } from './create.mts'

vi.mock<typeof import('@modules/aws/s3-bedrock-batch')>(
  import('@modules/aws/s3-bedrock-batch'),
  async importOriginal => ({
    ...(await importOriginal<typeof import('@modules/aws/s3-bedrock-batch')>()),
    S3BedrockBatchClient: {
      send: vi.fn<VitestLooseMock>(),
    } as unknown as typeof S3BedrockBatchClient,
  }),
)
vi.mock<typeof import('@modules/aws/bedrock-control')>(
  import('@modules/aws/bedrock-control'),
  async importOriginal => ({
    ...(await importOriginal<typeof import('@modules/aws/bedrock-control')>()),
    BedrockControlClient: {
      send: vi.fn<VitestLooseMock>(),
    } as unknown as typeof BedrockControlClient,
  }),
)

describe('createBatch input upload failure', () => {
  it('removes persisted batch rows and entity locks when input upload fails', async () => {
    vi.stubEnv('ENVIRONMENT', 'staging')
    const user = await createTestUserDirect()
    const suffix = randomUUID()
    const topicId = await insertTestTopic({ name: suffix, slug: suffix, createdById: user.id })
    const inputFile = join(tmpdir(), `bedrock-upload-${suffix}.jsonl`)
    const entityIdsFile = join(tmpdir(), `bedrock-upload-${suffix}.csv`)
    const error = new Error('input upload failed')
    vi.mocked(S3BedrockBatchClient.send).mockRejectedValueOnce(error)
    try {
      await writeFile(inputFile, '{}\n')
      await writeFile(entityIdsFile, `${topicId}\n`)
      await expect(createBatch(inputFile, 'topics', 1, entityIdsFile)).rejects.toBe(error)
      const upload = vi.mocked(S3BedrockBatchClient.send).mock.calls[0]![0] as PutObjectCommand
      const batchId = upload.input.Key!.split('/')[1]!
      expect(await getTestBatchEntities(batchId)).toEqual([])
      expect(await getTestBatchSummary(batchId)).toBeNull()
      expect(BedrockControlClient.send).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
      await Promise.all([inputFile, entityIdsFile].map(path => rm(path, { force: true })))
    }
  })
})
