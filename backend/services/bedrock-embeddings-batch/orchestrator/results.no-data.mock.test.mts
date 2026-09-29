import { access, readFile, unlink } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { S3BedrockBatchBucket, S3BedrockBatchClient } from '@modules/aws/s3-bedrock-batch'
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

describe('downloadBatchResults S3 I/O', () => {
  const tempFiles: string[] = []
  const readBatch = vi.fn<VitestLooseMock>()

  beforeEach(() => {
    vi.clearAllMocks()
    readBatch.mockResolvedValue({
      rows: [{ data: { outputS3Uri: `s3://${S3BedrockBatchBucket}/bedrock-output/` } }],
    })
  })

  afterEach(async () => {
    await Promise.all(tempFiles.splice(0).map(path => unlink(path).catch(() => {})))
  })

  it('lists paginated .out objects from the dedicated bucket and writes their bodies', async () => {
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

    const tempFilePath = await downloadBatchResults('batch-1', { read: readBatch })
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
    await expect(access(tempFilePath)).resolves.toBeUndefined()
  })
})
