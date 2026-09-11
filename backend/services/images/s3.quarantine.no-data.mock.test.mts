import { mkdtempDisposable, open, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockS3Send } = vi.hoisted(() => ({
  mockS3Send: vi.fn<VitestLooseMock>(),
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

describe('uploadImageToS3', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('uploads the image contents and metadata', async () => {
    await using directory = await mkdtempDisposable(join(tmpdir(), 's3-upload-'))
    const filename = join(directory.path, 'image.png')
    await writeFile(filename, 'image contents')
    let uploadedBody = ''
    mockS3Send.mockImplementationOnce(async command => {
      const body = (command as unknown as { input: { Body: AsyncIterable<Buffer> } }).input.Body
      for await (const chunk of body) uploadedBody += chunk.toString()
      return {} as never
    })
    const { uploadImageToS3 } = await import('./s3.mts')

    await uploadImageToS3({
      filename,
      hash: Buffer.from('unused hash'),
      metadata: { format: 'png' },
      s3Key: 'images/example.png',
    })

    const command = mockS3Send.mock.calls[0]![0] as unknown as {
      input: { Bucket: string; Key: string; ContentType: string }
    }
    expect(command.input).toMatchObject({
      Bucket: S3Buckets.images,
      Key: 'images/example.png',
      ContentType: 'image/png',
    })
    expect(uploadedBody).toBe('image contents')
  })

  it('disposes the file handle when the provider rejects before reading the stream', async () => {
    await using directory = await mkdtempDisposable(join(tmpdir(), 's3-upload-'))
    const filename = join(directory.path, 'image.png')
    await writeFile(filename, 'image contents')
    const probe = await open(filename, 'r')
    const fileHandlePrototype = Object.getPrototypeOf(probe) as {
      [Symbol.asyncDispose]: () => Promise<void>
    }
    await probe.close()
    const dispose = vi.spyOn(fileHandlePrototype, Symbol.asyncDispose)
    mockS3Send.mockRejectedValueOnce(new Error('upload failed'))
    const { uploadImageToS3 } = await import('./s3.mts')

    try {
      await expect(
        uploadImageToS3({
          filename,
          hash: Buffer.from('image hash'),
          metadata: {},
        }),
      ).rejects.toThrow('upload failed')
      expect(dispose).toHaveBeenCalledOnce()
    } finally {
      dispose.mockRestore()
    }
  })
})

describe('copyImageToQuarantine', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('copies image from images bucket to quarantine bucket', async () => {
    mockS3Send.mockResolvedValueOnce({} as never)
    const { copyImageToQuarantine } = await import('./s3.mts')

    await copyImageToQuarantine({ s3_key: 'abc123' })

    expect(mockS3Send).toHaveBeenCalledOnce()
    const command = mockS3Send.mock.calls[0]![0] as unknown as { input: Record<string, unknown> }
    expect(command.input.Bucket).toBe(S3Buckets.quarantine)
    expect(command.input.Key).toBe('abc123')
    expect(command.input.CopySource).toBe(`${S3Buckets.images}/abc123`)
  })
})

describe('deleteImagesFromS3', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('deletes the selected images in one provider request', async () => {
    mockS3Send.mockResolvedValueOnce({} as never)
    const { deleteImagesFromS3 } = await import('./s3.mts')

    await deleteImagesFromS3([{ s3_key: 'first' }, { s3_key: 'second' }])

    const command = mockS3Send.mock.calls[0]![0] as unknown as {
      input: { Bucket: string; Delete: { Objects: { Key: string }[]; Quiet: boolean } }
    }
    expect(command.input.Bucket).toBe(S3Buckets.images)
    expect(command.input.Delete).toEqual({
      Objects: [{ Key: 'first' }, { Key: 'second' }],
      Quiet: true,
    })
  })

  it('reports per-object provider errors as an aggregate', async () => {
    mockS3Send.mockResolvedValueOnce({
      Errors: [{ Key: 'second', Code: 'AccessDenied', Message: 'denied' }],
    } as never)
    const { deleteImagesFromS3 } = await import('./s3.mts')

    const error = await deleteImagesFromS3([{ s3_key: 'first' }, { s3_key: 'second' }]).catch(
      (caught: unknown) => caught,
    )

    expect(error).toBeInstanceOf(AggregateError)
    expect((error as AggregateError).errors).toHaveLength(1)
  })

  it('deletes more than 1,000 images in bounded provider requests', async () => {
    mockS3Send.mockResolvedValue({} as never)
    const { deleteImagesFromS3 } = await import('./s3.mts')

    await deleteImagesFromS3(
      Array.from({ length: 1001 }, (_, index) => ({ s3_key: `image-${index}` })),
    )

    expect(mockS3Send).toHaveBeenCalledTimes(2)
    const firstCommand = mockS3Send.mock.calls[0]![0] as unknown as {
      input: { Delete: { Objects: { Key: string }[] } }
    }
    const secondCommand = mockS3Send.mock.calls[1]![0] as unknown as {
      input: { Delete: { Objects: { Key: string }[] } }
    }
    expect(firstCommand.input.Delete.Objects).toHaveLength(1000)
    expect(secondCommand.input.Delete.Objects).toEqual([{ Key: 'image-1000' }])
  })

  it('attempts later chunks and aggregates provider request failures', async () => {
    mockS3Send
      .mockRejectedValueOnce(new Error('network failed'))
      .mockRejectedValueOnce('provider unavailable')
      .mockResolvedValueOnce({})
    const { deleteImagesFromS3 } = await import('./s3.mts')

    const error = await deleteImagesFromS3(
      Array.from({ length: 2001 }, (_, index) => ({ s3_key: `image-${index}` })),
    ).catch((caught: unknown) => caught)

    expect(mockS3Send).toHaveBeenCalledTimes(3)
    expect(error).toBeInstanceOf(AggregateError)
    expect((error as AggregateError).errors).toEqual([
      new Error('network failed'),
      new Error('provider unavailable'),
    ])
  })
})

describe('deleteImageRenders', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('returns early without calling DeleteObjects when no renders exist', async () => {
    mockS3Send.mockResolvedValueOnce({ Contents: [] } as never)
    const { deleteImageRenders } = await import('./s3.mts')

    await deleteImageRenders('abc123')

    expect(mockS3Send).toHaveBeenCalledOnce()
    const listCommand = mockS3Send.mock.calls[0]![0] as unknown as {
      input: Record<string, unknown>
    }
    expect(listCommand.input.Bucket).toBe(S3Buckets.renders)
    expect(listCommand.input.Prefix).toBe('abc123--')
  })

  it('calls DeleteObjects when renders exist', async () => {
    mockS3Send
      .mockResolvedValueOnce({
        Contents: [{ Key: 'abc123--100x100.webp' }, { Key: 'abc123--200x200.webp' }],
      } as never)
      .mockResolvedValueOnce({} as never)
    const { deleteImageRenders } = await import('./s3.mts')

    await deleteImageRenders('abc123')

    expect(mockS3Send).toHaveBeenCalledTimes(2)
    const deleteCommand = mockS3Send.mock.calls[1]![0] as unknown as {
      input: { Bucket: string; Delete: { Objects: { Key: string }[] } }
    }
    expect(deleteCommand.input.Bucket).toBe(S3Buckets.renders)
    expect(deleteCommand.input.Delete.Objects).toHaveLength(2)
    expect(deleteCommand.input.Delete.Objects[0]!.Key).toBe('abc123--100x100.webp')
    expect(deleteCommand.input.Delete.Objects[1]!.Key).toBe('abc123--200x200.webp')
  })
})
