import { beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { S3Buckets } from '@modules/aws'
import { createTestUser } from '@voucha/test-helpers'
import {
  putS3Object,
  readS3ObjectBytes,
  s3ObjectExists,
} from '@voucha/test-helpers/aws-emulator-s3'
import { runBeforePostgresStatementForTest } from '@voucha/test-helpers/injected-failures'
import { useMissingS3Bucket } from '@voucha/test-helpers/missing-s3-bucket'
import { createImageUploadUrl } from '../create-upload-url.mts'
import { completeImageUpload } from '../complete-upload.mts'
import * as digestModule from '../complete-upload-digest.mts'
import { deleteImageById } from '../delete.mts'
import { getImageById } from '../get.mts'
import { deriveUploadStatus } from '../get-upload-state.mts'
import { imageUploadsQueue } from '@queues/image-uploads/queues'
import { createHash, randomBytes } from 'node:crypto'
import type { PrivateUser } from '@voucha/types/entities/user'

// Each upload's bytes are random, so its digest key in the shared emulator belongs to this test.
async function stageUpload(user: PrivateUser, label: string, contentType = 'image/jpeg') {
  const { image_id } = await createImageUploadUrl(user, { contentType, contentLength: 1024 })
  const bytes = Buffer.from(`${label} ${randomBytes(16).toString('hex')}`)
  await putS3Object({
    Bucket: S3Buckets.imageUploads,
    Key: image_id,
    Body: bytes,
    ContentType: contentType,
  })
  const digest = createHash('sha256').update(bytes).digest()
  return { imageId: image_id, bytes, digest }
}

/** Run `action` once, right after the digest claim and before promotion begins. */
function afterDigestClaim(imageId: string, action: () => Promise<void>) {
  const persist = digestModule.persistImageHashWhileProcessing
  vi.spyOn(digestModule, 'persistImageHashWhileProcessing').mockImplementation(async (hash, id) => {
    const claimed = await persist(hash, id)
    if (id === imageId) await action()
    return claimed
  })
}

describe('completeImageUpload - success path', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  beforeEach(async () => {
    vi.restoreAllMocks()
    await imageUploadsQueue.obliterate({ force: true })
  })

  it('keeps deletion evidence null when staging-source deletion fails after promotion', async () => {
    const { imageId, bytes, digest } = await stageUpload(user, 'source deletion retry')
    // Promotion has finished when its key persists; the staging source delete then meets a
    // missing bucket.
    onTestFinished(
      runBeforePostgresStatementForTest('/* persistPromotedImageKey:update */', async () => {
        useMissingS3Bucket('imageUploads')
      }),
    )

    await expect(completeImageUpload(user, imageId)).resolves.toMatchObject({ id: imageId })

    const image = await getImageById(imageId)
    expect(image?.s3_key).toBe(digest.toString('hex'))
    expect(image?.upload_source_deleted_at).toBeNull()
    await expect(readS3ObjectBytes(S3Buckets.images, digest.toString('hex'))).resolves.toEqual(
      bytes,
    )
  })

  it('returns the promoted image when metadata enqueueing fails', async () => {
    const { imageId, digest } = await stageUpload(user, 'metadata enqueue')
    vi.spyOn(imageUploadsQueue, 'add').mockRejectedValueOnce(new Error('queue unavailable'))

    const result = await completeImageUpload(user, imageId)

    expect(result.s3_key).toBe(digest.toString('hex'))
    expect((await getImageById(imageId))?.s3_key).toBe(result.s3_key)
  })

  it('promotes the frozen body rather than a later staging mutation', async () => {
    const { imageId, bytes, digest } = await stageUpload(user, 'original', 'image/png')
    afterDigestClaim(imageId, async () => {
      await putS3Object({ Bucket: S3Buckets.imageUploads, Key: imageId, Body: 'mutated staging' })
    })

    await completeImageUpload(user, imageId)

    await expect(readS3ObjectBytes(S3Buckets.images, digest.toString('hex'))).resolves.toEqual(
      bytes,
    )
    await expect(readS3ObjectBytes(S3Buckets.images, imageId)).resolves.toEqual(bytes)
  })

  it('does not resurrect an image deleted while immutable promotion is in flight', async () => {
    const { imageId, digest } = await stageUpload(user, 'delete race')
    afterDigestClaim(imageId, async () => {
      await deleteImageById(imageId)
    })

    await expect(completeImageUpload(user, imageId)).rejects.toMatchObject({ status: 409 })

    expect(await getImageById(imageId)).toBeNull()
    // The promotion created both final objects after the deletion; the rejected promotion removed
    // them again.
    await expect(s3ObjectExists(S3Buckets.images, digest.toString('hex'))).resolves.toBe(false)
    await expect(s3ObjectExists(S3Buckets.images, imageId)).resolves.toBe(false)
  })

  it('returns processing image and enqueues metadata extraction', async () => {
    const { imageId, bytes, digest } = await stageUpload(user, 'fake image data')

    // Complete the upload — synchronous part of the flow
    const result = await completeImageUpload(user, imageId)

    // Verify the result reflects the processing handoff
    expect(result.id).toBe(imageId)
    expect(deriveUploadStatus(result)).toBe('processing')
    expect(result.sha_256).toEqual(digest)
    expect(result.s3_key).toBe(digest.toString('hex'))

    // The staged bytes moved to the digest object and the image-ID delivery alias.
    await expect(readS3ObjectBytes(S3Buckets.images, digest.toString('hex'))).resolves.toEqual(
      bytes,
    )
    await expect(readS3ObjectBytes(S3Buckets.images, imageId)).resolves.toEqual(bytes)
    await expect(s3ObjectExists(S3Buckets.imageUploads, imageId)).resolves.toBe(false)

    // Verify metadata extraction was enqueued for the worker using the production options. There
    // is deliberately no custom jobId: it would outlive the job and block the hourly recovery.
    const [queuedJob] = await imageUploadsQueue.searchJobs({ data: { id: imageId } })
    expect(queuedJob?.data).toEqual({ id: imageId })
    expect(queuedJob).toMatchObject({
      name: 'extract-metadata',
      data: { id: imageId },
      opts: {
        priority: 0,
        deduplication: {
          id: `extract-image-metadata-${imageId}`,
          mode: 'simple',
        },
      },
    })
    expect(queuedJob?.opts.jobId).toBeUndefined()

    // Verify database row reflects processing + persisted hash
    const updatedImage = await getImageById(imageId)
    expect(updatedImage && deriveUploadStatus(updatedImage)).toBe('processing')
    expect(updatedImage?.sha_256).toEqual(digest)
    expect(updatedImage?.upload_source_deleted_at).toBeInstanceOf(Date)
  })

  it('handles deduplication - return existing image if hash matches', async () => {
    const first = await stageUpload(user, 'fake image data')
    const firstResult = await completeImageUpload(user, first.imageId)

    // First upload is now in processing state with the persisted hash
    expect(deriveUploadStatus(firstResult)).toBe('processing')

    // Stage a second upload with the same content
    const { image_id: secondImageId } = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })
    await putS3Object({ Bucket: S3Buckets.imageUploads, Key: secondImageId, Body: first.bytes })

    // Complete second upload - should return first image
    const secondResult = await completeImageUpload(user, secondImageId)

    // Should return the first image because hash matched
    expect(secondResult.id).toBe(firstResult.id)

    // The duplicate's staged source is gone and it never gained a delivery alias
    await expect(s3ObjectExists(S3Buckets.imageUploads, secondImageId)).resolves.toBe(false)
    await expect(s3ObjectExists(S3Buckets.images, secondImageId)).resolves.toBe(false)

    // Verify second image was deleted from database
    const deletedImage = await getImageById(secondImageId)
    expect(deletedImage).toBeNull()
  })
})
