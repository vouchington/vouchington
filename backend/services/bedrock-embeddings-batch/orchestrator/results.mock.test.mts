import { access, readFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { S3BedrockBatchBucket, S3BedrockBatchClient } from '@modules/aws/s3-bedrock-batch'
import { insertTestEmbeddingsBatch } from '@voucha/test-helpers/entities/bedrock-embeddings-batches'
import { downloadBatchResults } from './results.mts'

vi.mock<typeof import('@modules/aws/s3-bedrock-batch')>(
  import('@modules/aws/s3-bedrock-batch'),
  async importOriginal => ({
    ...(await importOriginal<typeof import('@modules/aws/s3-bedrock-batch')>()),
    S3BedrockBatchClient: {
      send: vi.fn<VitestLooseMock>(),
    } as unknown as typeof import('@modules/aws/s3-bedrock-batch').S3BedrockBatchClient,
  }),
)

async function insertBatchWithOutput(outputS3Uri: string): Promise<string> {
  const id = crypto.randomUUID()
  // A completed batch stays out of the in-flight accounting that other files read.
  await insertTestEmbeddingsBatch({ id, bedrockStatus: 'Completed', batchData: { outputS3Uri } })
  return id
}

describe('downloadBatchResults', () => {
  const tempFiles: string[] = []

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await Promise.all(tempFiles.splice(0).map(path => unlink(path).catch(() => {})))
  })

  it('reports a missing batch without reaching S3', async () => {
    const missingBatchId = crypto.randomUUID()

    await expect(downloadBatchResults(missingBatchId)).rejects.toThrow(
      `Batch not found: ${missingBatchId}`,
    )
    expect(S3BedrockBatchClient.send).not.toHaveBeenCalled()
  })

  it('removes the temp result file when S3 listing fails', async () => {
    const batchId = await insertBatchWithOutput(`s3://${S3BedrockBatchBucket}/bedrock-output/`)
    vi.spyOn(Date, 'now').mockReturnValue(123)
    const tempFilePath = join(tmpdir(), `bedrock-batch-results-${batchId}-123.jsonl`)
    vi.mocked(S3BedrockBatchClient.send).mockRejectedValueOnce(new Error('S3 list failed'))

    await expect(downloadBatchResults(batchId)).rejects.toThrow('S3 list failed')
    await expect(access(tempFilePath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects a Bedrock output URI that is not the dedicated bedrock-batch bucket', async () => {
    const unsupportedUri = 's3://example-bucket/bedrock-embeddings-output/'
    const batchId = await insertBatchWithOutput(unsupportedUri)

    await expect(downloadBatchResults(batchId)).rejects.toThrow(
      `Unsupported Bedrock output URI: ${unsupportedUri}`,
    )
    expect(S3BedrockBatchClient.send).not.toHaveBeenCalled()
  })

  it('rejects a batch whose row has no output S3 URI', async () => {
    const batchId = crypto.randomUUID()
    await insertTestEmbeddingsBatch({ id: batchId, bedrockStatus: 'Completed' })

    await expect(downloadBatchResults(batchId)).rejects.toThrow(
      `Batch ${batchId} has no output S3 URI`,
    )
    expect(S3BedrockBatchClient.send).not.toHaveBeenCalled()
  })

  it('skips output objects without a body', async () => {
    const batchId = await insertBatchWithOutput(`s3://${S3BedrockBatchBucket}/bedrock-output/`)
    vi.mocked(S3BedrockBatchClient.send)
      .mockResolvedValueOnce({ Contents: [{ Key: 'bedrock-output/empty.out' }] } as never)
      .mockResolvedValueOnce({ Body: null } as never)

    const tempFilePath = await downloadBatchResults(batchId)
    tempFiles.push(tempFilePath)

    await expect(readFile(tempFilePath, 'utf8')).resolves.toBe('')
  })

  it('lists paginated .out objects from the dedicated bucket and writes their bodies', async () => {
    const batchId = await insertBatchWithOutput(`s3://${S3BedrockBatchBucket}/bedrock-output/`)
    vi.mocked(S3BedrockBatchClient.send)
      .mockResolvedValueOnce({
        Contents: [{ Key: 'bedrock-output/a.out' }, { Key: 'bedrock-output/skip.json' }],
        NextContinuationToken: 'next-page',
      } as never)
      .mockResolvedValueOnce({
        Contents: [{ Key: 'bedrock-output/b.out' }, { Key: undefined }],
      } as never)
      .mockResolvedValueOnce({
        Body: Readable.from(['{"recordId":"1"}\n']),
      } as never)
      .mockResolvedValueOnce({
        Body: Readable.from(['{"recordId":"2"}\n']),
      } as never)

    const tempFilePath = await downloadBatchResults(batchId)
    tempFiles.push(tempFilePath)

    expect(S3BedrockBatchClient.send).toHaveBeenCalledTimes(4)
    const [listPage1, listPage2, getA, getB] = vi
      .mocked(S3BedrockBatchClient.send)
      .mock.calls.map(call => call[0])
    expect(listPage1).toBeInstanceOf(ListObjectsV2Command)
    expect(listPage2).toBeInstanceOf(ListObjectsV2Command)
    expect(getA).toBeInstanceOf(GetObjectCommand)
    expect(getB).toBeInstanceOf(GetObjectCommand)
    expect((listPage1 as ListObjectsV2Command).input).toMatchObject({
      Bucket: S3BedrockBatchBucket,
      Prefix: 'bedrock-output/',
    })
    expect((listPage2 as ListObjectsV2Command).input).toMatchObject({
      Bucket: S3BedrockBatchBucket,
      Prefix: 'bedrock-output/',
      ContinuationToken: 'next-page',
    })
    expect((getA as GetObjectCommand).input).toEqual({
      Bucket: S3BedrockBatchBucket,
      Key: 'bedrock-output/a.out',
    })
    expect((getB as GetObjectCommand).input).toEqual({
      Bucket: S3BedrockBatchBucket,
      Key: 'bedrock-output/b.out',
    })
    await expect(readFile(tempFilePath, 'utf8')).resolves.toBe(
      '{"recordId":"1"}\n{"recordId":"2"}\n',
    )
  })
})
