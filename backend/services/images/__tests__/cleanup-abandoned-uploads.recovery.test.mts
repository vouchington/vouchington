import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  backdateImageUploadStagedAt,
  createTestUser,
  markImageDeleted,
  readEnqueuedJob,
  setImageHashAndProcessing,
  setTestImageHashWhileProcessing,
} from '@voucha/test-helpers'
import {
  onEnqueueAdmission,
  type EnqueueAdmission,
} from '@data-stores/valkey-glide-mq/glide-mq-admission'
import { imageUploadsQueue } from '@queues/image-uploads/queues'
import { cleanupAbandonedUploads } from '../cleanup-abandoned-uploads.mts'
import { createImageUploadUrl } from '../create-upload-url.mts'
import { getImageByHash, getImageById } from '../get.mts'
import * as s3Module from '../s3-upload-lifecycle.mts'
import { randomBytes } from 'node:crypto'
import type { PrivateUser } from '@voucha/types/entities/user'

describe('cleanupAbandonedUploads', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('recovers immutable processing rows instead of deleting final media', async () => {
    const result = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })
    const now = new Date()
    await backdateImageUploadStagedAt(
      result.image_id,
      new Date(now.getTime() - 25 * 60 * 60 * 1000),
    )
    const sha256 = randomBytes(32)
    await setImageHashAndProcessing(result.image_id, sha256)
    const deleteFromS3Spy = vi.spyOn(s3Module, 'deleteKnownImageStorageFromS3')
    const deleteSourceSpy = vi
      .spyOn(s3Module, 'deleteImageUploadSourceFromS3')
      .mockResolvedValue(undefined)

    const admissions: EnqueueAdmission[] = []
    const off = onEnqueueAdmission(event => {
      const [input] = event.inputs
      if (
        event.queue === imageUploadsQueue &&
        event.jobName === 'extract-metadata' &&
        typeof input === 'object' &&
        input !== null &&
        'id' in input &&
        input.id === result.image_id
      ) {
        admissions.push(event)
      }
      return undefined
    })
    let cleanupResult: Awaited<ReturnType<typeof cleanupAbandonedUploads>>
    try {
      cleanupResult = await cleanupAbandonedUploads({
        imageIds: [result.image_id],
        now: new Date(now.getTime()),
      })
    } finally {
      off()
    }

    expect(cleanupResult.recovered).toBeGreaterThanOrEqual(1)
    expect(admissions).toHaveLength(1)
    expect(deleteFromS3Spy).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: result.image_id }),
    )
    expect(deleteSourceSpy).toHaveBeenCalledWith(expect.objectContaining({ id: result.image_id }))
    expect(await getImageById(result.image_id)).not.toBeNull()
    const [admission] = admissions
    expect(admission).toBeDefined()
    if (!admission) throw new Error('Missing owned extract-metadata enqueue admission')
    const completionResult = await admission.completion
    const job = await readEnqueuedJob(imageUploadsQueue, completionResult)
    expect(job.data).toEqual({ id: result.image_id })
  })

  it('retries deleting a staged source after promotion', async () => {
    const result = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })
    const now = new Date()
    await backdateImageUploadStagedAt(
      result.image_id,
      new Date(now.getTime() - 2 * 60 * 60 * 1000),
      'complete',
    )
    const deleteSourceSpy = vi
      .spyOn(s3Module, 'deleteImageUploadSourceFromS3')
      .mockResolvedValue(undefined)

    const cleanupResult = await cleanupAbandonedUploads({
      imageIds: [result.image_id],
      now: new Date(now.getTime()),
    })

    expect(cleanupResult.stagedSourcesDeleted).toBeGreaterThanOrEqual(1)
    expect(deleteSourceSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: result.image_id, upload_staged_at: expect.any(Date) }),
    )
    expect((await getImageById(result.image_id))?.upload_source_deleted_at).toBeInstanceOf(Date)
  })

  it('retries deleting all known storage for a deleted staged image', async () => {
    const result = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })
    const now = new Date()
    await backdateImageUploadStagedAt(
      result.image_id,
      new Date(now.getTime() - 2 * 60 * 60 * 1000),
      'complete',
    )
    await markImageDeleted(result.image_id)
    let failedOwnedDelete = false
    const deleteKnownSpy = vi
      .spyOn(s3Module, 'deleteKnownImageStorageFromS3')
      .mockImplementation(async image => {
        if (image.id === result.image_id && !failedOwnedDelete) {
          failedOwnedDelete = true
          throw new Error('storage delete failed')
        }
      })

    await cleanupAbandonedUploads({ imageIds: [result.image_id], now: new Date(now.getTime()) })

    expect((await getImageById(result.image_id, true))?.upload_source_deleted_at).toBeNull()

    const cleanupResult = await cleanupAbandonedUploads({
      imageIds: [result.image_id],
      now: new Date(now.getTime()),
    })

    expect(cleanupResult.stagedSourcesDeleted).toBeGreaterThanOrEqual(1)
    expect(deleteKnownSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: result.image_id, deleted_at: expect.any(Date) }),
    )
    expect((await getImageById(result.image_id, true))?.upload_source_deleted_at).toBeInstanceOf(
      Date,
    )
  })

  it('retains a digest for cleanup retry, then releases it after storage deletion', async () => {
    const result = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })
    const now = new Date()
    const sha256 = randomBytes(32)
    await backdateImageUploadStagedAt(
      result.image_id,
      new Date(now.getTime() - 25 * 60 * 60 * 1000),
    )
    await setTestImageHashWhileProcessing(result.image_id, sha256)
    let deleteAttempts = 0
    const deleteFromS3Spy = vi
      .spyOn(s3Module, 'deleteKnownImageStorageFromS3')
      .mockImplementation(async () => {
        deleteAttempts += 1
        if (deleteAttempts === 1) throw new Error('storage delete failed')
      })

    const scope = { imageIds: [result.image_id], now: new Date(now.getTime()) }
    const firstCleanup = await cleanupAbandonedUploads(scope)

    expect(firstCleanup.cleaned).toBeGreaterThanOrEqual(1)
    expect(deleteFromS3Spy).toHaveBeenCalledWith(
      expect.objectContaining({ id: result.image_id, sha_256: sha256 }),
    )
    expect((await getImageById(result.image_id, true))?.sha_256).toEqual(sha256)

    const secondCleanup = await cleanupAbandonedUploads(scope)

    expect(secondCleanup.stagedSourcesDeleted).toBeGreaterThanOrEqual(1)
    expect(deleteFromS3Spy).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: result.image_id, sha_256: sha256 }),
    )
    expect((await getImageById(result.image_id, true))?.sha_256).toBeNull()
    expect(await getImageByHash(sha256, true)).toBeNull()
  })
})
