import { access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { S3BedrockBatchBucket } from '@modules/aws/s3-bedrock-batch'
import { downloadBatchResults } from './results.mts'

describe('downloadBatchResults', () => {
  const readBatch = vi.fn<VitestLooseMock>()
  const listOutputObjectKeys = vi.fn<VitestLooseMock>()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(Date, 'now').mockReturnValue(123)
    readBatch.mockResolvedValue({
      rows: [{ data: { outputS3Uri: `s3://${S3BedrockBatchBucket}/bedrock-output/` } }],
    })
    listOutputObjectKeys.mockRejectedValue(new Error('S3 list failed'))
  })

  it('removes the temp result file when S3 listing fails', async () => {
    const tempFilePath = join(tmpdir(), 'bedrock-batch-results-batch-1-123.jsonl')

    await expect(
      downloadBatchResults('batch-1', { read: readBatch, listOutputObjectKeys }),
    ).rejects.toThrow('S3 list failed')
    await expect(access(tempFilePath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects a Bedrock output URI that is not the dedicated bedrock-batch bucket', async () => {
    const unsupportedUri = 's3://example-bucket/bedrock-embeddings-output/'
    readBatch.mockResolvedValue({
      rows: [{ data: { outputS3Uri: unsupportedUri } }],
    })

    await expect(
      downloadBatchResults('batch-1', { read: readBatch, listOutputObjectKeys }),
    ).rejects.toThrow(`Unsupported Bedrock output URI: ${unsupportedUri}`)
    expect(listOutputObjectKeys).not.toHaveBeenCalled()
  })

  it('skips output objects without a body', async () => {
    listOutputObjectKeys.mockResolvedValue(['bedrock-output/empty.jsonl'])

    const tempFilePath = await downloadBatchResults('batch-1', {
      read: readBatch,
      listOutputObjectKeys,
      getOutputObject: vi.fn<VitestLooseMock>().mockResolvedValue({ Body: null }),
    })

    await expect(access(tempFilePath)).resolves.toBeUndefined()
  })
})
