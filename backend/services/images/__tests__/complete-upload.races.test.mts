import { afterEach, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { S3Buckets } from '@modules/aws'
import {
  createTestUser,
  insertPendingTestImage,
  setImageHashAndProcessing,
  updateImageStatus,
} from '@voucha/test-helpers'
import {
  putS3Object,
  readS3ObjectBytes,
  s3ObjectExists,
} from '@voucha/test-helpers/aws-emulator-s3'
import { useMissingS3Bucket } from '@voucha/test-helpers/missing-s3-bucket'
import { createImageUploadUrl } from '../create-upload-url.mts'
import { completeImageUpload } from '../complete-upload.mts'
import * as imageReads from '../get.mts'
import { getImageById } from '../get.mts'
import { deriveUploadStatus } from '../get-upload-state.mts'
import * as storageLifecycleLock from '../storage-lifecycle-lock.mts'
import { imageUploadsQueue } from '@queues/image-uploads/queues'
import { createHash, randomBytes } from 'node:crypto'
import type { PrivateUser } from '@voucha/types/entities/user'

function stageSource(imageId: string, bytes: Buffer) {
  return putS3Object({ Bucket: S3Buckets.imageUploads, Key: imageId, Body: bytes })
}

/** A failed upload that owns `hash`, with its staged source and delivery alias still stored. */
async function insertFailedOwner(userId: string, hash: Buffer) {
  const failedImageId = await insertPendingTestImage(userId)
  await setImageHashAndProcessing(failedImageId, hash)
  await updateImageStatus(failedImageId, 'failed')
  await Promise.all([
    putS3Object({ Bucket: S3Buckets.imageUploads, Key: failedImageId, Body: 'failed source' }),
    putS3Object({ Bucket: S3Buckets.images, Key: failedImageId, Body: 'failed alias' }),
  ])
  return failedImageId
}

describe('completeImageUpload - duplicate recovery and races', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    await imageUploadsQueue.obliterate({ force: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('allows a fresh upload when an older matching upload failed', async () => {
    const bytes = Buffer.from(`retry image data ${randomBytes(16).toString('hex')}`)
    const failedImageId = await insertFailedOwner(
      user.id,
      createHash('sha256').update(bytes).digest(),
    )
    const { image_id: retryImageId } = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })
    await stageSource(retryImageId, bytes)

    const result = await completeImageUpload(user, retryImageId)

    expect(result.id).toBe(retryImageId)
    expect(deriveUploadStatus(result)).toBe('processing')
    expect(await getImageById(failedImageId)).toBeNull()
    await expect(s3ObjectExists(S3Buckets.imageUploads, failedImageId)).resolves.toBe(false)
    await expect(s3ObjectExists(S3Buckets.images, failedImageId)).resolves.toBe(false)
    await expect(s3ObjectExists(S3Buckets.imageUploads, retryImageId)).resolves.toBe(false)
    await expect(readS3ObjectBytes(S3Buckets.images, retryImageId)).resolves.toEqual(bytes)
    const replacementJobs = await imageUploadsQueue.searchJobs({ data: { id: retryImageId } })
    expect(replacementJobs).toHaveLength(1)
  })

  it('retains a failed duplicate row when its source cannot be deleted', async () => {
    const bytes = Buffer.from(`failed duplicate cleanup ${randomBytes(16).toString('hex')}`)
    const hash = createHash('sha256').update(bytes).digest()
    const failedImageId = await insertFailedOwner(user.id, hash)
    const { image_id: retryImageId } = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })
    await stageSource(retryImageId, bytes)
    // The retry has already read its own source when it looks up the digest owner; the failed
    // owner's source deletion then meets a missing staging bucket.
    let restoreUploads: (() => void) | undefined
    const realGetImageByHash = imageReads.getImageByHash
    vi.spyOn(imageReads, 'getImageByHash').mockImplementation(async (...args) => {
      const image = await realGetImageByHash(...args)
      if (image?.id === failedImageId) restoreUploads ??= useMissingS3Bucket('imageUploads')
      return image
    })

    await expect(completeImageUpload(user, retryImageId)).rejects.toMatchObject({
      name: 'NoSuchBucket',
    })
    restoreUploads?.()

    expect(await getImageById(failedImageId)).not.toBeNull()
    await expect(s3ObjectExists(S3Buckets.imageUploads, failedImageId)).resolves.toBe(true)
    const retry = await getImageById(retryImageId)
    expect(retry && deriveUploadStatus(retry)).toBe('failed')
  })

  it('waits for failed-image storage cleanup before replacing its digest owner', async () => {
    const bytes = Buffer.from(`failed lifecycle race ${randomBytes(16).toString('hex')}`)
    const failedImageId = await insertFailedOwner(
      user.id,
      createHash('sha256').update(bytes).digest(),
    )
    const { image_id: retryImageId } = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })
    await stageSource(retryImageId, bytes)

    let releaseLock!: () => void
    let lockAcquired!: () => void
    const lockReleased = new Promise<void>(resolve => {
      releaseLock = resolve
    })
    const acquired = new Promise<void>(resolve => {
      lockAcquired = resolve
    })
    const lockHolder = storageLifecycleLock.withImageStorageLifecycleLock(
      failedImageId,
      async () => {
        lockAcquired()
        await lockReleased
      },
    )
    await acquired
    // A failed assertion below must not leave the advisory lock held for later tests.
    onTestFinished(async () => {
      releaseLock()
      await lockHolder
    })

    const replacementEnteredLock = Promise.withResolvers<void>()
    const lock = storageLifecycleLock.withImageStorageLifecycleLock
    vi.spyOn(storageLifecycleLock, 'withImageStorageLifecycleLock').mockImplementation(
      (...args) => {
        replacementEnteredLock.resolve()
        return lock(...args)
      },
    )
    let hashLookupCompleted!: () => void
    const hashLookup = new Promise<void>(resolve => {
      hashLookupCompleted = resolve
    })
    const realGetImageByHash = imageReads.getImageByHash
    vi.spyOn(imageReads, 'getImageByHash').mockImplementation(async (...args) => {
      const image = await realGetImageByHash(...args)
      hashLookupCompleted()
      return image
    })
    const completion = completeImageUpload(user, retryImageId)
    void completion.catch(() => {})
    await hashLookup
    await replacementEnteredLock.promise

    await expect(s3ObjectExists(S3Buckets.imageUploads, failedImageId)).resolves.toBe(true)

    releaseLock()
    await lockHolder
    await expect(completion).resolves.toMatchObject({ id: retryImageId })
    await expect(s3ObjectExists(S3Buckets.imageUploads, failedImageId)).resolves.toBe(false)
  })

  it('marks a claimed upload as failed when its staged source is missing', async () => {
    const imageId = await insertPendingTestImage(user.id)

    const error = await completeImageUpload(user, imageId)
      .then(() => undefined)
      .catch((err: unknown) => err as Error)

    expect(error).toMatchObject({ name: 'NoSuchKey' })
    const failed = await getImageById(imageId)
    expect(failed && deriveUploadStatus(failed)).toBe('failed')
    expect(failed?.upload_error).toBe(error?.message)
  })

  it('recovers the winning image when digest persistence races', async () => {
    const bytes = Buffer.from(`digest race ${randomBytes(16).toString('hex')}`)
    const firstImageId = await insertPendingTestImage(user.id)
    const secondImageId = await insertPendingTestImage(user.id)
    await Promise.all([stageSource(firstImageId, bytes), stageSource(secondImageId, bytes)])

    const results = await Promise.all([
      completeImageUpload(user, firstImageId),
      completeImageUpload(user, secondImageId),
    ])
    expect(results[0].id).toBe(results[1].id)
    expect([firstImageId, secondImageId]).toContain(results[0].id)
    const loserId = results[0].id === firstImageId ? secondImageId : firstImageId
    expect(await getImageById(loserId)).toBeNull()
    await expect(s3ObjectExists(S3Buckets.imageUploads, loserId)).resolves.toBe(false)
  })

  it('reuses the winner when failed-image replacements race', async () => {
    const bytes = Buffer.from(`replacement race ${randomBytes(16).toString('hex')}`)
    const failedImageId = await insertFailedOwner(
      user.id,
      createHash('sha256').update(bytes).digest(),
    )
    const incomingIds = await Promise.all([
      insertPendingTestImage(user.id),
      insertPendingTestImage(user.id),
    ])
    await Promise.all(incomingIds.map(imageId => stageSource(imageId, bytes)))

    const replacements = await Promise.all(
      incomingIds.map(imageId => completeImageUpload(user, imageId)),
    )

    expect(replacements[0].id).toBe(replacements[1].id)
    expect(incomingIds).toContain(replacements[0].id)
    expect(await getImageById(failedImageId)).toBeNull()
    const loserId = incomingIds.find(id => id !== replacements[0].id)
    expect(loserId && (await getImageById(loserId))).toBeNull()
    await expect(s3ObjectExists(S3Buckets.imageUploads, loserId!)).resolves.toBe(false)
  })
})
