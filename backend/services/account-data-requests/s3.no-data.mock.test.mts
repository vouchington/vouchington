import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockS3Send, mockGetSignedUrl, mockCreateReadStream } = vi.hoisted(() => ({
  mockS3Send: vi.fn<VitestLooseMock>(),
  mockGetSignedUrl: vi.fn<VitestLooseMock>(),
  mockCreateReadStream: vi.fn<VitestLooseMock>().mockReturnValue('mock-stream'),
}))

vi.mock<typeof import('@modules/aws')>(import('@modules/aws'), async importOriginal => {
  return {
    ...(await importOriginal<typeof import('@modules/aws')>()),
    S3ImagesClient: {
      send: mockS3Send,
    } as unknown as typeof import('@modules/aws').S3ImagesClient,
  }
})

import { S3Buckets } from '@modules/aws'

vi.mock<typeof import('@aws-sdk/s3-request-presigner')>(
  import('@aws-sdk/s3-request-presigner'),
  () => ({
    getSignedUrl: mockGetSignedUrl,
  }),
)

vi.mock<typeof import('node:fs')>(import('node:fs'), async importOriginal => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  createReadStream: mockCreateReadStream,
}))

describe('uploadExportToS3', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('uploads zip to correct bucket with correct key', async () => {
    mockS3Send.mockResolvedValueOnce({} as never)
    const { uploadExportToS3 } = await import('./s3.mts')

    const s3Key = await uploadExportToS3('request-123', 'attempt-456', '/tmp/export.zip')

    expect(s3Key).toBe('request-123/attempt-456.zip')
    expect(mockS3Send).toHaveBeenCalledOnce()
    const command = mockS3Send.mock.calls[0]![0] as unknown as {
      input: Record<string, unknown>
    }
    expect(command.input.Bucket).toBe(S3Buckets.userExports)
    expect(command.input.Key).toBe('request-123/attempt-456.zip')
    expect(command.input.ContentType).toBe('application/zip')
    expect(command.input.Body).toBe('mock-stream')
  })

  it('passes the provider-effect abort deadline to S3', async () => {
    mockS3Send.mockResolvedValueOnce({} as never)
    const { uploadExportToS3 } = await import('./s3.mts')
    const abortController = new AbortController()

    await uploadExportToS3('request-123', 'attempt-456', '/tmp/export.zip', abortController.signal)

    expect(mockS3Send.mock.calls[0]?.[1]).toEqual({ abortSignal: abortController.signal })
  })
})

describe('getExportDownloadUrl', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('generates presigned URL with default 1-hour expiry', async () => {
    mockGetSignedUrl.mockResolvedValueOnce('https://s3.example.com/signed-url' as never)
    const { getExportDownloadUrl } = await import('./s3.mts')

    const url = await getExportDownloadUrl('request-123.zip')

    expect(url).toBe('https://s3.example.com/signed-url')
    expect(mockGetSignedUrl).toHaveBeenCalledOnce()
    const [, , opts] = mockGetSignedUrl.mock.calls[0]!
    expect(opts).toEqual({ expiresIn: 3600 })
  })

  it('generates presigned URL with custom expiry', async () => {
    mockGetSignedUrl.mockResolvedValueOnce('https://s3.example.com/signed-url' as never)
    const { getExportDownloadUrl } = await import('./s3.mts')

    await getExportDownloadUrl('request-123.zip', 604800)

    const [, , opts] = mockGetSignedUrl.mock.calls[0]!
    expect(opts).toEqual({ expiresIn: 604800 })
  })

  it('sets correct ResponseContentDisposition', async () => {
    mockGetSignedUrl.mockResolvedValueOnce('https://s3.example.com/signed-url' as never)
    const { getExportDownloadUrl } = await import('./s3.mts')

    await getExportDownloadUrl('request-123.zip')

    const [, command] = mockGetSignedUrl.mock.calls[0]!
    const cmd = command as unknown as { input: Record<string, unknown> }
    expect(cmd.input.ResponseContentDisposition).toBe('attachment; filename="export.zip"')
    expect(cmd.input.Bucket).toBe(S3Buckets.userExports)
    expect(cmd.input.Key).toBe('request-123.zip')
  })
})

describe('deleteExportFromS3', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('deletes 1001 exports in serial chunks and continues after partial failures', async () => {
    const transportError = new Error('transport failed')
    mockS3Send.mockRejectedValueOnce(transportError).mockResolvedValueOnce({
      Errors: [{ Key: 'export-1000.zip', Code: 'AccessDenied' }],
    } as never)
    const { deleteExportsFromS3 } = await import('./s3.mts')
    const keys = Array.from({ length: 1001 }, (_, index) => `export-${index}.zip`)

    const error = await deleteExportsFromS3(keys).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(AggregateError)
    expect((error as AggregateError).errors).toHaveLength(2)
    expect(mockS3Send).toHaveBeenCalledTimes(2)
    type DeleteInput = { input: { Delete: { Objects: { Key: string }[] } } }
    const first = mockS3Send.mock.calls[0]![0] as unknown as DeleteInput
    const second = mockS3Send.mock.calls[1]![0] as unknown as DeleteInput
    expect(first.input.Delete.Objects).toHaveLength(1000)
    expect(second.input.Delete.Objects).toEqual([{ Key: 'export-1000.zip' }])
  })

  it('sends delete command with correct bucket and key', async () => {
    mockS3Send.mockResolvedValueOnce({} as never)
    const { deleteExportFromS3 } = await import('./s3.mts')

    await deleteExportFromS3('request-123.zip')

    expect(mockS3Send).toHaveBeenCalledOnce()
    const command = mockS3Send.mock.calls[0]![0] as unknown as {
      input: Record<string, unknown>
    }
    expect(command.input.Bucket).toBe(S3Buckets.userExports)
    expect(command.input.Key).toBe('request-123.zip')
  })
})
