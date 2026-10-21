import { randomBytes } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { S3Buckets } from '@modules/aws'
import { onEnqueueAdmission, type EnqueueAdmission } from '@vouchington/worker-runtime/glide-mq'
import { imageUploadsQueue } from '@queues/image-uploads/queues'
import {
  backdateImageUploadStagedAt,
  createTestUser,
  readEnqueuedJob,
  setImageHashAndProcessing,
  setTestImageHashWhileProcessing,
} from '@voucha/test-helpers'
import { cleanupOwnedTestUploads } from '@voucha/test-helpers/image-upload-cleanup'
import { createOwnedStagedImage } from '@voucha/test-helpers/image-upload-cleanup-fixtures'
import { installOwnedUploadCleanupStorage } from '@voucha/test-helpers/image-upload-cleanup-storage'
import { cleanupAbandonedUploads } from './cleanup-abandoned-uploads.mts'
import { cleanupStagedUploadSource } from './cleanup-staged-upload-source.mts'
import { getImageByHash, getImageById } from './get.mts'

const HOUR = 60 * 60 * 1000
const ROLLOVERS = [
  '2025-02-01T00:00:00.001Z',
  '2024-03-01T00:00:00.001Z',
  '2026-01-01T00:00:00.001Z',
] as const

describe('abandoned upload cleanup', () => {
  afterEach(() => vi.restoreAllMocks())

  it('deletes only the old pending owned upload and keeps a recent upload', async () => {
    const now = new Date()
    const oldId = await createOwnedStagedImage(new Date(now.getTime() - 25 * HOUR))
    const recentId = await createOwnedStagedImage(now)
    const storage = installOwnedUploadCleanupStorage([oldId, recentId])
    const result = await cleanupOwnedTestUploads(cleanupAbandonedUploads, [oldId, recentId], now)
    expect(result.cleaned).toBe(1)
    expect(storage.calls).toEqual([{ Bucket: S3Buckets.imageUploads, Key: oldId }])
    expect(await getImageById(oldId)).toBeNull()
    expect(await getImageById(recentId)).not.toBeNull()
  })

  it('retries a failed staged-source deletion without acknowledging it early', async () => {
    const stagedAt = new Date(Date.now() - 2 * HOUR)
    const id = await createOwnedStagedImage(stagedAt)
    await backdateImageUploadStagedAt(id, stagedAt, 'complete')
    let failed = false
    const storage = installOwnedUploadCleanupStorage(
      [id, id.replaceAll('-', '').repeat(2)],
      async input => {
        if (!failed && input.Key === id) {
          failed = true
          throw new Error('owned storage failure')
        }
      },
    )
    expect(await cleanupStagedUploadSource(id)).toBe(false)
    expect((await getImageById(id, true))?.upload_source_deleted_at).toBeNull()
    expect(await cleanupStagedUploadSource(id)).toBe(true)
    expect((await getImageById(id, true))?.upload_source_deleted_at).toBeInstanceOf(Date)
    expect((await getImageById(id))?.upload_completed_at).toBeInstanceOf(Date)
    expect(storage.calls).toEqual([
      { Bucket: S3Buckets.imageUploads, Key: id },
      { Bucket: S3Buckets.imageUploads, Key: id },
    ])
  })

  it('cleans an old unpromoted processing upload and its known storage', async () => {
    const now = new Date()
    const id = await createOwnedStagedImage(new Date(now.getTime() - 25 * HOUR))
    await backdateImageUploadStagedAt(id, new Date(now.getTime() - 25 * HOUR), 'processing')
    const digest = randomBytes(32)
    await setTestImageHashWhileProcessing(id, digest)
    const storage = installOwnedUploadCleanupStorage([id, digest.toString('hex')])
    const result = await cleanupOwnedTestUploads(cleanupAbandonedUploads, [id], now)
    expect(result.cleaned).toBe(1)
    expect(storage.calls).toEqual([
      { Bucket: S3Buckets.imageUploads, Key: id },
      { Bucket: S3Buckets.images, Key: digest.toString('hex') },
      { Bucket: S3Buckets.images, Key: id },
    ])
    expect(await getImageById(id)).toBeNull()
    expect((await getImageById(id, true))?.sha_256).toBeNull()
  })

  it('recovers a hashed processing upload without deleting its final media', async () => {
    const now = new Date()
    const id = await createOwnedStagedImage(new Date(now.getTime() - 25 * HOUR), true)
    const digest = randomBytes(32)
    await setImageHashAndProcessing(id, digest)
    const storage = installOwnedUploadCleanupStorage([id])
    const result = await cleanupOwnedTestUploads(cleanupAbandonedUploads, [id], now)
    expect(await cleanupStagedUploadSource(id)).toBe(true)
    expect(result).toMatchObject({ cleaned: 0, recovered: 1 })
    expect(storage.calls).toEqual([{ Bucket: S3Buckets.imageUploads, Key: id }])
    expect(await getImageById(id)).not.toBeNull()
    expect((await getImageById(id))?.upload_source_deleted_at).toBeInstanceOf(Date)
  })

  it('retains an abandoned-image digest after failed storage deletion, then releases it', async () => {
    const now = new Date()
    const id = await createOwnedStagedImage(new Date(now.getTime() - 25 * HOUR), true)
    const digest = randomBytes(32)
    await setTestImageHashWhileProcessing(id, digest)
    let failed = false
    const storage = installOwnedUploadCleanupStorage([id, digest.toString('hex')], async input => {
      if (!failed && input.Key === id) {
        failed = true
        throw new Error('owned storage failure')
      }
    })
    const first = await cleanupOwnedTestUploads(cleanupAbandonedUploads, [id], now)
    expect(first.cleaned).toBe(1)
    expect((await getImageById(id, true))?.sha_256).toEqual(digest)
    expect(await cleanupStagedUploadSource(id)).toBe(true)
    await cleanupOwnedTestUploads(cleanupAbandonedUploads, [id], now)
    expect(storage.calls).toEqual(
      Array.from({ length: 2 }, () => [
        { Bucket: S3Buckets.imageUploads, Key: id },
        { Bucket: S3Buckets.images, Key: digest.toString('hex') },
        { Bucket: S3Buckets.images, Key: id },
      ]).flat(),
    )
    expect((await getImageById(id, true))?.sha_256).toBeNull()
    expect(await getImageByHash(digest, true)).toBeNull()
  })

  it.each(ROLLOVERS)('enqueues only before the one-hour UTC edge at %s', async instant => {
    const now = new Date(instant)
    const user = await createTestUser()
    const ids = await Promise.all(
      [-1, 0, 1].map(delta =>
        createOwnedStagedImage(new Date(now.getTime() - HOUR + delta), true, user),
      ),
    )
    for (const id of ids) await setImageHashAndProcessing(id, randomBytes(32))
    const storage = installOwnedUploadCleanupStorage(ids)
    const admissions: EnqueueAdmission[] = []
    const off = onEnqueueAdmission(event => {
      const [input] = event.inputs
      if (
        event.queue === imageUploadsQueue &&
        event.jobName === 'extract-metadata' &&
        typeof input === 'object' &&
        input !== null &&
        'id' in input &&
        ids.includes(String(input.id))
      )
        admissions.push(event)
    })
    try {
      const result = await cleanupOwnedTestUploads(cleanupAbandonedUploads, ids, now)
      expect(result.recovered).toBe(1)
      expect(admissions).toHaveLength(1)
      const admission = admissions[0]
      if (!admission) throw new Error('Missing owned recovery admission')
      expect((await readEnqueuedJob(imageUploadsQueue, await admission.completion)).data).toEqual({
        id: ids[0],
      })
      expect(storage.calls).toEqual([])
      for (const id of ids) expect(await getImageById(id)).not.toBeNull()
    } finally {
      off()
      await Promise.allSettled(admissions.map(admission => admission.completion))
    }
  })

  it.each(ROLLOVERS)('abandons only before the 24-hour UTC edge at %s', async instant => {
    const now = new Date(instant)
    const user = await createTestUser()
    const ids = await Promise.all(
      [-1, 0, 1].map(delta =>
        createOwnedStagedImage(new Date(now.getTime() - 24 * HOUR + delta), false, user),
      ),
    )
    const storage = installOwnedUploadCleanupStorage(ids)
    const result = await cleanupOwnedTestUploads(cleanupAbandonedUploads, ids, now)
    expect(result.cleaned).toBe(1)
    expect(storage.calls).toEqual([{ Bucket: S3Buckets.imageUploads, Key: ids[0] }])
    expect(await getImageById(ids[0]!)).toBeNull()
    expect(await getImageById(ids[1]!)).not.toBeNull()
    expect(await getImageById(ids[2]!)).not.toBeNull()
  })
})
