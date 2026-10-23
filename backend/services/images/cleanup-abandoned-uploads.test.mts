import { createOwnedUploadRecoveryQueue } from '@voucha/test-helpers/image-upload-cleanup-queue'
import { beforeEach, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { randomBytes } from 'node:crypto'
import { S3Buckets } from '@modules/aws'
import {
  backdateImageUploadStagedAt,
  createTestUser,
  setTestImageHashWhileProcessing,
} from '@voucha/test-helpers'
import {
  cleanupOwnedTestUploads,
  insertOwnedUploadCleanupCluster,
  makeOwnedUploadCleanupSweep,
} from '@voucha/test-helpers/image-upload-cleanup'
import { installOwnedUploadCleanupStorage } from '@voucha/test-helpers/image-upload-cleanup-storage'
import { cleanupAbandonedUploads } from './cleanup-abandoned-uploads.mts'
import { createImageUploadUrl } from './create-upload-url.mts'
import { getImageById } from './get.mts'
import { deriveUploadStatus } from './get-upload-state.mts'
import type { PrivateUser } from '@voucha/types/entities/user'

const HOUR = 60 * 60 * 1000

let recoveryTarget: ReturnType<typeof createOwnedUploadRecoveryQueue>
const runCleanup: typeof cleanupAbandonedUploads = (sweep, save) =>
  cleanupAbandonedUploads(sweep, save, recoveryTarget.queue)
describe('cleanupAbandonedUploads', () => {
  let user: PrivateUser
  beforeAll(async () => {
    user = await createTestUser()
  })
  beforeEach(context => {
    const target = createOwnedUploadRecoveryQueue()
    recoveryTarget = target
    context.onTestFinished(() => target.close())
  })
  afterEach(() => vi.restoreAllMocks())

  it('should cleanup pending uploads older than 24 hours', async () => {
    const result = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })
    const now = new Date()
    const stagedAt = new Date(now.getTime() - 25 * HOUR)
    await backdateImageUploadStagedAt(result.image_id, stagedAt)
    const storage = installOwnedUploadCleanupStorage([result.image_id])
    const cleanup = await cleanupOwnedTestUploads(runCleanup, [result.image_id], now)
    expect(cleanup.cleaned).toBe(1)
    expect(storage.calls).toEqual([{ Bucket: S3Buckets.imageUploads, Key: result.image_id }])
    expect(await getImageById(result.image_id)).toBeNull()
    expect((await getImageById(result.image_id, true))?.upload_staged_at).toEqual(stagedAt)
  })

  it('should cleanup processing uploads older than 24 hours', async () => {
    const result = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })
    const now = new Date()
    const stagedAt = new Date(now.getTime() - 25 * HOUR)
    await backdateImageUploadStagedAt(result.image_id, stagedAt, 'processing')
    const sha256 = randomBytes(32)
    await setTestImageHashWhileProcessing(result.image_id, sha256)
    const storage = installOwnedUploadCleanupStorage([result.image_id, sha256.toString('hex')])
    const cleanup = await cleanupOwnedTestUploads(runCleanup, [result.image_id], now)
    expect(cleanup.cleaned).toBe(1)
    expect(storage.calls).toEqual(
      expect.arrayContaining([
        { Bucket: S3Buckets.imageUploads, Key: result.image_id },
        { Bucket: S3Buckets.images, Key: sha256.toString('hex') },
        { Bucket: S3Buckets.images, Key: result.image_id },
      ]),
    )
    expect(await getImageById(result.image_id)).toBeNull()
    expect((await getImageById(result.image_id, true))?.sha_256).toBeNull()
    expect((await getImageById(result.image_id, true))?.upload_staged_at).toEqual(stagedAt)
  })

  it('should not cleanup recent pending uploads', async () => {
    const result = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })
    const storage = installOwnedUploadCleanupStorage([result.image_id])
    await cleanupOwnedTestUploads(runCleanup, [result.image_id], new Date())
    expect(storage.calls).toEqual([])
    const image = await getImageById(result.image_id)
    expect(image && deriveUploadStatus(image)).toBe('pending')
  })

  it('should not cleanup completed uploads', async () => {
    const result = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })
    const now = new Date()
    await backdateImageUploadStagedAt(
      result.image_id,
      new Date(now.getTime() - 25 * HOUR),
      'complete',
    )
    const storage = installOwnedUploadCleanupStorage([result.image_id])
    await cleanupOwnedTestUploads(runCleanup, [result.image_id], now)
    expect(storage.calls).toEqual([{ Bucket: S3Buckets.imageUploads, Key: result.image_id }])
    const image = await getImageById(result.image_id)
    expect(image && deriveUploadStatus(image)).toBe('complete')
  })

  it('cleans a bounded batch of old uploads', async () => {
    const now = new Date()
    const ids = await insertOwnedUploadCleanupCluster(
      user.id,
      5,
      new Date(now.getTime() - 25 * HOUR),
    )
    const storage = installOwnedUploadCleanupStorage(ids)
    const sweep = await makeOwnedUploadCleanupSweep(ids, now)
    const cleanup = await runCleanup(sweep, async () => {})
    expect(cleanup.cleaned).toBe(5)
    expect(cleanup.hasMore).toBe(false)
    expect(storage.calls.map(call => call.Key).toSorted()).toEqual([...ids].toSorted())
    for (const id of ids) expect(await getImageById(id)).toBeNull()
  })
})
