import { createHash } from 'node:crypto'
import { mkdtempDisposable, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { finalSend, uploadSend } = vi.hoisted(() => ({
  finalSend: vi.fn<VitestLooseMock>(),
  uploadSend: vi.fn<VitestLooseMock>(),
}))

vi.mock<typeof import('@modules/aws')>(import('@modules/aws'), async importOriginal => ({
  ...(await importOriginal<typeof import('@modules/aws')>()),
  S3ImagesClient: { send: finalSend } as unknown as typeof import('@modules/aws').S3ImagesClient,
  S3ImageUploadsClient: {
    send: uploadSend,
  } as unknown as typeof import('@modules/aws').S3ImageUploadsClient,
}))

import { S3Buckets } from '@modules/aws'
import {
  deleteImageDeliveryAliasFromS3,
  deleteImageUploadSourceFromS3,
  deleteKnownImageStorageFromS3,
  ensureImageDeliveryAliasInS3,
  getImageUploadSourceFromS3,
  promoteFrozenImageToS3,
} from './s3-upload-lifecycle.mts'

describe('image upload S3 lifecycle', () => {
  beforeEach(() => {
    finalSend.mockReset()
    uploadSend.mockReset()
  })

  it('reads marked upload sources from private staging', async () => {
    uploadSend.mockResolvedValueOnce({ Body: Readable.from(['staged']) })

    await getImageUploadSourceFromS3({
      id: '01900000-0000-7000-8000-000000000001',
      s3_key: 'upload-key',
      upload_staged_at: new Date(),
    })

    expect(uploadSend).toHaveBeenCalledOnce()
    expect(finalSend).not.toHaveBeenCalled()
    expect(getCommandInput(uploadSend)).toMatchObject({
      Bucket: S3Buckets.imageUploads,
      Key: '01900000-0000-7000-8000-000000000001',
    })
  })

  it('creates final digest objects conditionally from the frozen file', async () => {
    await using directory = await mkdtempDisposable(join(tmpdir(), 'image-promotion-'))
    const filename = join(directory.path, 'frozen')
    const bytes = Buffer.from('immutable image')
    const sha256 = createHash('sha256').update(bytes).digest()
    await writeFile(filename, bytes)
    let uploaded = Buffer.alloc(0)
    finalSend.mockImplementationOnce(async command => {
      const input = (command as { input: { Body: AsyncIterable<Buffer> } }).input
      for await (const chunk of input.Body) uploaded = Buffer.concat([uploaded, chunk])
      return {}
    })

    const result = await promoteFrozenImageToS3({ filename, sha256, contentType: 'image/png' })

    expect(result).toEqual({ created: true, s3Key: sha256.toString('hex') })
    expect(uploaded).toEqual(bytes)
    expect(getCommandInput(finalSend)).toMatchObject({
      Bucket: S3Buckets.images,
      Key: sha256.toString('hex'),
      IfNoneMatch: '*',
      ContentType: 'image/png',
    })
    expect(await readFile(filename)).toEqual(bytes)
  })

  it('accepts an existing digest object only when its bytes match', async () => {
    await using directory = await mkdtempDisposable(join(tmpdir(), 'image-promotion-'))
    const filename = join(directory.path, 'frozen')
    const bytes = Buffer.from('same image')
    const sha256 = createHash('sha256').update(bytes).digest()
    await writeFile(filename, bytes)
    finalSend
      .mockRejectedValueOnce({ name: 'PreconditionFailed', $metadata: { httpStatusCode: 412 } })
      .mockResolvedValueOnce({ Body: Readable.from([bytes]) })

    await expect(promoteFrozenImageToS3({ filename, sha256 })).resolves.toEqual({
      created: false,
      s3Key: sha256.toString('hex'),
    })
    expect(finalSend).toHaveBeenCalledTimes(2)
  })

  it('creates a verified final delivery alias at the image ID', async () => {
    await using directory = await mkdtempDisposable(join(tmpdir(), 'image-promotion-'))
    const filename = join(directory.path, 'frozen')
    const bytes = Buffer.from('delivery alias')
    const sha256 = createHash('sha256').update(bytes).digest()
    const imageId = '01900000-0000-7000-8000-000000000007'
    await writeFile(filename, bytes)
    finalSend.mockResolvedValueOnce({})

    await expect(
      ensureImageDeliveryAliasInS3(imageId, { filename, sha256, contentType: 'image/png' }),
    ).resolves.toEqual({ created: true, s3Key: imageId })
    expect(getCommandInput(finalSend)).toMatchObject({
      Bucket: S3Buckets.images,
      Key: imageId,
      IfNoneMatch: '*',
      ContentType: 'image/png',
    })
  })

  it('rejects a mismatched existing digest object without overwriting it', async () => {
    await using directory = await mkdtempDisposable(join(tmpdir(), 'image-promotion-'))
    const filename = join(directory.path, 'frozen')
    const bytes = Buffer.from('expected image')
    const sha256 = createHash('sha256').update(bytes).digest()
    await writeFile(filename, bytes)
    finalSend
      .mockRejectedValueOnce({ name: 'PreconditionFailed', $metadata: { httpStatusCode: 412 } })
      .mockResolvedValueOnce({ Body: Readable.from(['different image']) })

    await expect(promoteFrozenImageToS3({ filename, sha256 })).rejects.toThrow(
      `Final image integrity mismatch at key ${sha256.toString('hex')}`,
    )
    expect(finalSend).toHaveBeenCalledTimes(2)
  })

  it('deletes staging and final objects by database-known keys', async () => {
    finalSend.mockResolvedValue({})
    uploadSend.mockResolvedValue({})
    const id = '01900000-0000-7000-8000-000000000003'
    const sha256 = createHash('sha256').update('deleted image').digest()

    await deleteKnownImageStorageFromS3({
      id,
      s3_key: sha256.toString('hex'),
      sha_256: sha256,
      upload_staged_at: new Date(),
    })

    expect(uploadSend).toHaveBeenCalledOnce()
    expect(getCommandInput(uploadSend)).toMatchObject({
      Bucket: S3Buckets.imageUploads,
      Key: id,
    })
    expect(finalSend).toHaveBeenCalledTimes(2)
    expect(getCommandInput(finalSend, 0)).toMatchObject({
      Bucket: S3Buckets.images,
      Key: sha256.toString('hex'),
    })
    expect(getCommandInput(finalSend, 1)).toMatchObject({
      Bucket: S3Buckets.images,
      Key: id,
    })
  })

  it('deletes the digest and delivery alias for an existing final image', async () => {
    finalSend.mockResolvedValue({})
    const id = '01900000-0000-7000-8000-000000000006'
    const sha256 = createHash('sha256').update('reconciled image').digest()

    await deleteKnownImageStorageFromS3({
      id,
      s3_key: sha256.toString('hex'),
      sha_256: sha256,
      upload_staged_at: null,
    })

    expect(finalSend).toHaveBeenCalledTimes(2)
    expect(getCommandInput(finalSend, 0)).toMatchObject({
      Bucket: S3Buckets.images,
      Key: sha256.toString('hex'),
    })
    expect(getCommandInput(finalSend, 1)).toMatchObject({
      Bucket: S3Buckets.images,
      Key: id,
    })
  })

  it('deletes a final delivery alias for a staged row whose key persistence was interrupted', async () => {
    finalSend.mockResolvedValue({})
    uploadSend.mockResolvedValue({})
    const id = '01900000-0000-7000-8000-000000000008'
    const sha256 = createHash('sha256').update('interrupted promotion').digest()

    await deleteKnownImageStorageFromS3({
      id,
      s3_key: id,
      sha_256: sha256,
      upload_staged_at: new Date(),
    })

    expect(finalSend).toHaveBeenCalledTimes(2)
    expect(getCommandInput(finalSend, 0)).toMatchObject({
      Bucket: S3Buckets.images,
      Key: sha256.toString('hex'),
    })
    expect(getCommandInput(finalSend, 1)).toMatchObject({ Bucket: S3Buckets.images, Key: id })
  })

  it('deletes an upload source from staging', async () => {
    const stagedId = '01900000-0000-7000-8000-000000000004'
    await deleteImageUploadSourceFromS3({
      id: stagedId,
      s3_key: 'ignored-for-staged',
      upload_staged_at: new Date(),
    })
    expect(getCommandInput(uploadSend)).toMatchObject({
      Bucket: S3Buckets.imageUploads,
      Key: stagedId,
    })
    expect(finalSend).not.toHaveBeenCalled()
  })

  it('deletes a delivery alias from the final bucket', async () => {
    await deleteImageDeliveryAliasFromS3('01900000-0000-7000-8000-000000000005')

    expect(getCommandInput(finalSend)).toMatchObject({
      Bucket: S3Buckets.images,
      Key: '01900000-0000-7000-8000-000000000005',
    })
  })
})

function getCommandInput(
  mock: { mock: { calls: unknown[][] } },
  call = 0,
): Record<string, unknown> {
  const args = mock.mock.calls[call]
  if (!args) throw new Error(`Missing S3 call ${call}`)
  return (args[0] as { input: Record<string, unknown> }).input
}
