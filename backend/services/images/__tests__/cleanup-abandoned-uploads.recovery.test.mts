import { createOwnedUploadRecoveryQueue } from '@voucha/test-helpers/image-upload-cleanup-queue'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { randomBytes } from 'node:crypto'
import { S3Buckets } from '@modules/aws'
import {
  backdateImageUploadStagedAt,
  createTestUser,
  markImageDeleted,
  readEnqueuedJob,
  setImageHashAndProcessing,
  setTestImageHashWhileProcessing,
} from '@voucha/test-helpers'
import { cleanupOwnedTestUploads } from '@voucha/test-helpers/image-upload-cleanup'
import { installOwnedUploadCleanupStorage } from '@voucha/test-helpers/image-upload-cleanup-storage'
import {
  onEnqueueAdmission,
  type EnqueueAdmission,
} from '@data-stores/valkey-glide-mq/glide-mq-admission'
import { cleanupAbandonedUploads } from '../cleanup-abandoned-uploads.mts'
import { createImageUploadUrl } from '../create-upload-url.mts'
import { getImageByHash, getImageById } from '../get.mts'

const HOUR = 60 * 60 * 1000

let recoveryTarget: ReturnType<typeof createOwnedUploadRecoveryQueue>
const runCleanup: typeof cleanupAbandonedUploads = (sweep, save) =>
  cleanupAbandonedUploads(sweep, save, recoveryTarget.queue)
describe('cleanupAbandonedUploads', () => {
  beforeEach(context => {
    const target = createOwnedUploadRecoveryQueue()
    recoveryTarget = target
    context.onTestFinished(() => target.close())
  })

  afterEach(() => vi.restoreAllMocks())

  it('recovers immutable processing rows instead of deleting final media', async () => {
    const user = await createTestUser()
    const upload = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })
    const now = new Date()
    await backdateImageUploadStagedAt(upload.image_id, new Date(now.getTime() - 25 * HOUR))
    await setImageHashAndProcessing(upload.image_id, randomBytes(32))
    const storage = installOwnedUploadCleanupStorage([upload.image_id])
    const admissions: EnqueueAdmission[] = []
    const off = onEnqueueAdmission(event => {
      const [input] = event.inputs
      if (
        event.queue === recoveryTarget.queue &&
        event.jobName === 'extract-metadata' &&
        typeof input === 'object' &&
        input !== null &&
        'id' in input &&
        input.id === upload.image_id
      )
        admissions.push(event)
    })
    try {
      const result = await cleanupOwnedTestUploads(runCleanup, [upload.image_id], now)
      expect(result.recovered).toBe(1)
      expect(result.cleaned).toBe(0)
      expect(storage.calls).toEqual([{ Bucket: S3Buckets.imageUploads, Key: upload.image_id }])
      expect(await getImageById(upload.image_id)).not.toBeNull()
      expect(admissions).toHaveLength(1)
      const admission = admissions[0]
      if (!admission) throw new Error('Missing owned extraction admission')
      const job = await readEnqueuedJob(recoveryTarget.queue, await admission.completion)
      expect(job.data).toEqual({ id: upload.image_id })
    } finally {
      off()
    }
  })

  it('retries deleting a staged source after promotion', async () => {
    const user = await createTestUser()
    const upload = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })
    const now = new Date()
    await backdateImageUploadStagedAt(
      upload.image_id,
      new Date(now.getTime() - 2 * HOUR),
      'complete',
    )
    const storage = installOwnedUploadCleanupStorage([upload.image_id])
    const result = await cleanupOwnedTestUploads(runCleanup, [upload.image_id], now)
    expect(result.stagedSourcesDeleted).toBe(1)
    expect(storage.calls).toEqual([{ Bucket: S3Buckets.imageUploads, Key: upload.image_id }])
    expect((await getImageById(upload.image_id))?.upload_source_deleted_at).toBeInstanceOf(Date)
  })

  it('retries deleting all known storage for a deleted staged image', async () => {
    const user = await createTestUser()
    const upload = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })
    const now = new Date()
    await backdateImageUploadStagedAt(
      upload.image_id,
      new Date(now.getTime() - 2 * HOUR),
      'complete',
    )
    await markImageDeleted(upload.image_id)
    const digest = upload.image_id.replaceAll('-', '').repeat(2)
    let failed = false
    const storage = installOwnedUploadCleanupStorage([upload.image_id, digest], async input => {
      if (!failed && input.Key === upload.image_id && input.Bucket === S3Buckets.imageUploads) {
        failed = true
        throw new Error('storage delete failed')
      }
    })
    await cleanupOwnedTestUploads(runCleanup, [upload.image_id], now)
    expect((await getImageById(upload.image_id, true))?.upload_source_deleted_at).toBeNull()
    const result = await cleanupOwnedTestUploads(runCleanup, [upload.image_id], now)
    expect(result.stagedSourcesDeleted).toBe(1)
    expect(storage.calls).toContainEqual({ Bucket: S3Buckets.images, Key: digest })
    expect((await getImageById(upload.image_id, true))?.upload_source_deleted_at).toBeInstanceOf(
      Date,
    )
  })

  it('retains a digest for cleanup retry, then releases it after storage deletion', async () => {
    const user = await createTestUser()
    const upload = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })
    const now = new Date()
    const digest = randomBytes(32)
    await backdateImageUploadStagedAt(upload.image_id, new Date(now.getTime() - 25 * HOUR))
    await setTestImageHashWhileProcessing(upload.image_id, digest)
    let failed = false
    const storage = installOwnedUploadCleanupStorage(
      [upload.image_id, digest.toString('hex')],
      async input => {
        if (!failed && input.Key === upload.image_id && input.Bucket === S3Buckets.imageUploads) {
          failed = true
          throw new Error('storage delete failed')
        }
      },
    )
    const first = await cleanupOwnedTestUploads(runCleanup, [upload.image_id], now)
    expect(first.cleaned).toBe(1)
    expect((await getImageById(upload.image_id, true))?.sha_256).toEqual(digest)
    const second = await cleanupOwnedTestUploads(runCleanup, [upload.image_id], now)
    expect(second.stagedSourcesDeleted).toBe(1)
    expect(storage.calls).toContainEqual({ Bucket: S3Buckets.images, Key: digest.toString('hex') })
    expect((await getImageById(upload.image_id, true))?.sha_256).toBeNull()
    expect(await getImageByHash(digest, true)).toBeNull()
  })
})
