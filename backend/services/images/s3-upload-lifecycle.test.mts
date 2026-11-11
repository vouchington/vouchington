import { createHash, randomUUID } from 'node:crypto'
import { mkdtempDisposable, open, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HeadObjectCommand } from '@aws-sdk/client-s3'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { S3Buckets } from '@modules/aws'
import { useMissingS3Bucket } from '@voucha/test-helpers/missing-s3-bucket'
import {
  emulatorS3,
  putS3Object,
  readS3ObjectBytes,
  s3ObjectExists,
} from '@voucha/test-helpers/aws-emulator-s3'
import {
  deleteImageDeliveryAliasFromS3,
  deleteImageUploadSourceFromS3,
  deleteKnownImageStorageFromS3,
  ensureImageDeliveryAliasInS3,
  getImageUploadSourceFromS3,
  promoteFrozenImageToS3,
} from './s3-upload-lifecycle.mts'

// Every key derives from fresh random content or ids: the emulator is shared by concurrent forks.
async function frozenFile(label: string) {
  const directory = await mkdtempDisposable(join(tmpdir(), 'image-promotion-'))
  onTestFinished(() => directory.remove())
  const filename = join(directory.path, 'frozen')
  const bytes = Buffer.from(`${label} ${randomUUID()}`)
  await writeFile(filename, bytes)
  return { filename, bytes, sha256: createHash('sha256').update(bytes).digest() }
}

async function storedObjects(objects: ReadonlyArray<{ Bucket: string; Key: string }>) {
  return (
    await Promise.all(
      objects.map(async object =>
        (await s3ObjectExists(object.Bucket, object.Key)) ? [object] : [],
      ),
    )
  ).flat()
}

async function seed(objects: ReadonlyArray<{ Bucket: string; Key: string }>) {
  await Promise.all(objects.map(object => putS3Object({ ...object, Body: 'stored' })))
}

describe('image upload S3 lifecycle', () => {
  it('reads marked upload sources from private staging', async () => {
    const id = randomUUID()
    await putS3Object({ Bucket: S3Buckets.imageUploads, Key: id, Body: 'staged' })

    const source = await getImageUploadSourceFromS3({
      id,
      s3_key: 'upload-key',
      upload_staged_at: new Date(),
    })

    await expect(source.Body?.transformToString()).resolves.toBe('staged')
  })

  it('creates final digest objects conditionally from the frozen file', async () => {
    const { filename, bytes, sha256 } = await frozenFile('immutable image')

    const result = await promoteFrozenImageToS3({ filename, sha256, contentType: 'image/png' })

    expect(result).toEqual({ created: true, s3Key: sha256.toString('hex') })
    await expect(readS3ObjectBytes(S3Buckets.images, sha256.toString('hex'))).resolves.toEqual(
      bytes,
    )
    await expect(
      emulatorS3().send(
        new HeadObjectCommand({ Bucket: S3Buckets.images, Key: sha256.toString('hex') }),
      ),
    ).resolves.toMatchObject({ ContentType: 'image/png' })
    expect(await readFile(filename)).toEqual(bytes)
  })

  it('disposes the frozen file handle when S3 rejects the upload', async () => {
    const { filename, sha256 } = await frozenFile('immutable image')
    const probe = await open(filename, 'r')
    const fileHandlePrototype = Object.getPrototypeOf(probe) as {
      [Symbol.asyncDispose]: () => Promise<void>
    }
    await probe.close()
    const dispose = vi.spyOn(fileHandlePrototype, Symbol.asyncDispose)
    onTestFinished(() => dispose.mockRestore())
    useMissingS3Bucket('images')

    await expect(promoteFrozenImageToS3({ filename, sha256 })).rejects.toMatchObject({
      name: 'NoSuchBucket',
    })
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('accepts an existing digest object only when its bytes match', async () => {
    const { filename, bytes, sha256 } = await frozenFile('same image')
    const key = sha256.toString('hex')
    await putS3Object({ Bucket: S3Buckets.images, Key: key, Body: bytes })

    await expect(promoteFrozenImageToS3({ filename, sha256 })).resolves.toEqual({
      created: false,
      s3Key: key,
    })
    await expect(readS3ObjectBytes(S3Buckets.images, key)).resolves.toEqual(bytes)
  })

  it('creates a verified final delivery alias at the image ID', async () => {
    const { filename, bytes, sha256 } = await frozenFile('delivery alias')
    const imageId = randomUUID()

    await expect(
      ensureImageDeliveryAliasInS3(imageId, { filename, sha256, contentType: 'image/png' }),
    ).resolves.toEqual({ created: true, s3Key: imageId })
    await expect(readS3ObjectBytes(S3Buckets.images, imageId)).resolves.toEqual(bytes)
    await expect(
      emulatorS3().send(new HeadObjectCommand({ Bucket: S3Buckets.images, Key: imageId })),
    ).resolves.toMatchObject({ ContentType: 'image/png' })
  })

  it('rejects a mismatched existing digest object without overwriting it', async () => {
    const { filename, sha256 } = await frozenFile('expected image')
    const key = sha256.toString('hex')
    await putS3Object({ Bucket: S3Buckets.images, Key: key, Body: 'different image' })

    await expect(promoteFrozenImageToS3({ filename, sha256 })).rejects.toThrow(
      `Final image integrity mismatch at key ${key}`,
    )
    await expect(readS3ObjectBytes(S3Buckets.images, key)).resolves.toEqual(
      Buffer.from('different image'),
    )
  })

  it('deletes staging and final objects by database-known keys', async () => {
    const id = randomUUID()
    const sha256 = createHash('sha256').update(`deleted image ${id}`).digest()
    const known = [
      { Bucket: S3Buckets.imageUploads, Key: id },
      { Bucket: S3Buckets.images, Key: sha256.toString('hex') },
      { Bucket: S3Buckets.images, Key: id },
    ]
    const unrelated = [{ Bucket: S3Buckets.imageUploads, Key: sha256.toString('hex') }]
    await seed([...known, ...unrelated])

    await deleteKnownImageStorageFromS3({
      id,
      s3_key: sha256.toString('hex'),
      sha_256: sha256,
      upload_staged_at: new Date(),
    })

    await expect(storedObjects([...known, ...unrelated])).resolves.toEqual(unrelated)
  })

  it('deletes the digest and delivery alias for an existing final image', async () => {
    const id = randomUUID()
    const sha256 = createHash('sha256').update(`reconciled image ${id}`).digest()
    const known = [
      { Bucket: S3Buckets.images, Key: sha256.toString('hex') },
      { Bucket: S3Buckets.images, Key: id },
    ]
    // An unstaged final image never reads the staging bucket.
    const staged = [{ Bucket: S3Buckets.imageUploads, Key: id }]
    await seed([...known, ...staged])

    await deleteKnownImageStorageFromS3({
      id,
      s3_key: sha256.toString('hex'),
      sha_256: sha256,
      upload_staged_at: null,
    })

    await expect(storedObjects([...known, ...staged])).resolves.toEqual(staged)
  })

  it('deletes a final delivery alias for a staged row whose key persistence was interrupted', async () => {
    const id = randomUUID()
    const sha256 = createHash('sha256').update(`interrupted promotion ${id}`).digest()
    const known = [
      { Bucket: S3Buckets.imageUploads, Key: id },
      { Bucket: S3Buckets.images, Key: sha256.toString('hex') },
      { Bucket: S3Buckets.images, Key: id },
    ]
    await seed(known)

    await deleteKnownImageStorageFromS3({
      id,
      s3_key: id,
      sha_256: sha256,
      upload_staged_at: new Date(),
    })

    await expect(storedObjects(known)).resolves.toEqual([])
  })

  it('deletes an upload source from staging', async () => {
    const stagedId = randomUUID()
    const staged = { Bucket: S3Buckets.imageUploads, Key: stagedId }
    const final = { Bucket: S3Buckets.images, Key: stagedId }
    await seed([staged, final])

    await deleteImageUploadSourceFromS3({
      id: stagedId,
      s3_key: 'ignored-for-staged',
      upload_staged_at: new Date(),
    })

    await expect(storedObjects([staged, final])).resolves.toEqual([final])
  })

  it('deletes a delivery alias from the final bucket', async () => {
    const imageId = randomUUID()
    const staged = { Bucket: S3Buckets.imageUploads, Key: imageId }
    const alias = { Bucket: S3Buckets.images, Key: imageId }
    await seed([staged, alias])

    await deleteImageDeliveryAliasFromS3(imageId)

    await expect(storedObjects([staged, alias])).resolves.toEqual([staged])
  })
})
