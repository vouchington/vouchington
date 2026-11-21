import { randomBytes } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { S3Buckets } from '@modules/aws'
import { imageUploadsQueue } from '@queues/image-uploads/queues'
import {
  backdateImageUploadStagedAt,
  createTestUser,
  setImageHashAndProcessing,
  setTestImageHashWhileProcessing,
} from '@voucha/test-helpers'
import { cleanupOwnedTestUploads } from '@voucha/test-helpers/image-upload-cleanup'
import { createOwnedStagedImage } from '@voucha/test-helpers/image-upload-cleanup-fixtures'
import { seedOwnedUploadCleanupStorage } from '@voucha/test-helpers/image-upload-cleanup-storage'
import { cleanupAbandonedUploads } from './cleanup-abandoned-uploads.mts'
import { cleanupStagedUploadSource } from './cleanup-staged-upload-source.mts'
import { getImageByHash, getImageById } from './get.mts'

const HOUR = 60 * 60 * 1000
const ROLLOVERS = [
  '2025-02-01T00:00:00.001Z',
  '2024-03-01T00:00:00.001Z',
  '2026-01-01T00:00:00.001Z',
] as const

function findExtractionJobs(id: string) {
  return imageUploadsQueue.searchJobs({ name: 'extract-metadata', data: { id } })
}

async function extractionImageIds(ids: readonly string[]) {
  const found = await Promise.all(
    ids.map(async id => ((await findExtractionJobs(id)).length ? id : null)),
  )
  return found.filter(id => id !== null)
}

describe('abandoned upload cleanup', () => {
  afterEach(() => vi.restoreAllMocks())

  it('acknowledges an owned staged source only once across concurrent cleanup', async () => {
    const stagedAt = new Date(Date.now() - 2 * HOUR)
    const id = await createOwnedStagedImage(stagedAt)
    await backdateImageUploadStagedAt(id, stagedAt, 'complete')
    const storage = await seedOwnedUploadCleanupStorage([id])
    const outcomes = await Promise.all([
      cleanupStagedUploadSource(id),
      cleanupStagedUploadSource(id),
    ])
    expect(outcomes.toSorted((a, b) => Number(a) - Number(b))).toEqual([false, true])
    expect((await getImageById(id, true))?.upload_source_deleted_at).toBeInstanceOf(Date)
    await expect(storage.deleted()).resolves.toEqual([{ Bucket: S3Buckets.imageUploads, Key: id }])
  })

  it('deletes only the old pending owned upload and keeps a recent upload', async () => {
    const now = new Date()
    const oldId = await createOwnedStagedImage(new Date(now.getTime() - 25 * HOUR))
    const recentId = await createOwnedStagedImage(now)
    const storage = await seedOwnedUploadCleanupStorage([oldId, recentId])
    const result = await cleanupOwnedTestUploads(cleanupAbandonedUploads, [oldId, recentId], now)
    expect(result.cleaned).toBe(1)
    await expect(storage.deleted()).resolves.toEqual([
      { Bucket: S3Buckets.imageUploads, Key: oldId },
    ])
    expect(await getImageById(oldId)).toBeNull()
    expect(await getImageById(recentId)).not.toBeNull()
  })

  it('retries a failed staged-source deletion without acknowledging it early', async () => {
    const stagedAt = new Date(Date.now() - 2 * HOUR)
    const id = await createOwnedStagedImage(stagedAt)
    await backdateImageUploadStagedAt(id, stagedAt, 'complete')
    const storage = await seedOwnedUploadCleanupStorage([id, id.replaceAll('-', '').repeat(2)])
    const restoreUploads = storage.failBucket('imageUploads')
    expect(await cleanupStagedUploadSource(id)).toBe(false)
    restoreUploads()
    await expect(storage.deleted()).resolves.toEqual([])
    expect((await getImageById(id, true))?.upload_source_deleted_at).toBeNull()
    expect(await cleanupStagedUploadSource(id)).toBe(true)
    expect((await getImageById(id, true))?.upload_source_deleted_at).toBeInstanceOf(Date)
    expect((await getImageById(id))?.upload_completed_at).toBeInstanceOf(Date)
    await expect(storage.deleted()).resolves.toEqual([{ Bucket: S3Buckets.imageUploads, Key: id }])
  })

  it('cleans an old unpromoted processing upload and its known storage', async () => {
    const now = new Date()
    const id = await createOwnedStagedImage(new Date(now.getTime() - 25 * HOUR))
    await backdateImageUploadStagedAt(id, new Date(now.getTime() - 25 * HOUR), 'processing')
    const digest = randomBytes(32)
    await setTestImageHashWhileProcessing(id, digest)
    const storage = await seedOwnedUploadCleanupStorage([id, digest.toString('hex')])
    const result = await cleanupOwnedTestUploads(cleanupAbandonedUploads, [id], now)
    expect(result.cleaned).toBe(1)
    await expect(storage.deleted()).resolves.toEqual([
      { Bucket: S3Buckets.imageUploads, Key: id },
      { Bucket: S3Buckets.images, Key: id },
      { Bucket: S3Buckets.images, Key: digest.toString('hex') },
    ])
    expect(await getImageById(id)).toBeNull()
    expect((await getImageById(id, true))?.sha_256).toBeNull()
  })

  it('recovers a hashed processing upload without deleting its final media', async () => {
    const now = new Date()
    const id = await createOwnedStagedImage(new Date(now.getTime() - 25 * HOUR), true)
    const digest = randomBytes(32)
    await setImageHashAndProcessing(id, digest)
    const storage = await seedOwnedUploadCleanupStorage([id, digest.toString('hex')])
    const result = await cleanupOwnedTestUploads(cleanupAbandonedUploads, [id], now)
    expect(result).toMatchObject({ cleaned: 0, recovered: 1, stagedSourcesDeleted: 1 })
    await expect(storage.deleted()).resolves.toEqual([{ Bucket: S3Buckets.imageUploads, Key: id }])
    expect(await getImageById(id)).not.toBeNull()
    expect((await getImageById(id))?.upload_source_deleted_at).toBeInstanceOf(Date)
  })

  it('retains an abandoned-image digest after failed storage deletion, then releases it', async () => {
    const now = new Date()
    const id = await createOwnedStagedImage(new Date(now.getTime() - 25 * HOUR), true)
    const digest = randomBytes(32)
    await setTestImageHashWhileProcessing(id, digest)
    const storage = await seedOwnedUploadCleanupStorage([id, digest.toString('hex')])
    const restoreUploads = storage.failBucket('imageUploads')
    const first = await cleanupOwnedTestUploads(cleanupAbandonedUploads, [id], now)
    restoreUploads()
    expect(first.cleaned).toBe(1)
    // Only the staged source failed; the final media in the images bucket is already gone.
    await expect(storage.deleted()).resolves.toEqual([
      { Bucket: S3Buckets.images, Key: id },
      { Bucket: S3Buckets.images, Key: digest.toString('hex') },
    ])
    expect((await getImageById(id, true))?.sha_256).toEqual(digest)
    expect(await cleanupStagedUploadSource(id)).toBe(true)
    await cleanupOwnedTestUploads(cleanupAbandonedUploads, [id], now)
    await expect(storage.deleted()).resolves.toEqual([
      { Bucket: S3Buckets.imageUploads, Key: id },
      { Bucket: S3Buckets.images, Key: id },
      { Bucket: S3Buckets.images, Key: digest.toString('hex') },
    ])
    expect((await getImageById(id, true))?.sha_256).toBeNull()
    expect(await getImageByHash(digest, true)).toBeNull()
  })

  it('admits every recovered image of a page', async () => {
    const now = new Date()
    const user = await createTestUser()
    const ids = await Promise.all(
      [0, 1].map(() => createOwnedStagedImage(new Date(now.getTime() - 25 * HOUR), true, user)),
    )
    for (const id of ids) await setImageHashAndProcessing(id, randomBytes(32))
    await seedOwnedUploadCleanupStorage(ids)
    const result = await cleanupOwnedTestUploads(cleanupAbandonedUploads, ids, now)
    expect(result.recovered).toBe(2)
    expect((await extractionImageIds(ids)).toSorted()).toEqual(ids.toSorted())
    for (const id of ids) {
      const [job] = await findExtractionJobs(id)
      expect(job?.opts.deduplication).toEqual({
        id: `extract-image-metadata-${id}`,
        mode: 'simple',
      })
    }
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
    const storage = await seedOwnedUploadCleanupStorage(ids)
    const result = await cleanupOwnedTestUploads(cleanupAbandonedUploads, ids, now)
    expect(result.recovered).toBe(1)
    expect(await extractionImageIds(ids)).toEqual([ids[0]])
    await expect(storage.deleted()).resolves.toEqual([
      { Bucket: S3Buckets.imageUploads, Key: ids[0] },
    ])
    for (const id of ids) expect(await getImageById(id)).not.toBeNull()
  })

  it.each(ROLLOVERS)('abandons only before the 24-hour UTC edge at %s', async instant => {
    const now = new Date(instant)
    const user = await createTestUser()
    const ids = await Promise.all(
      [-1, 0, 1].map(delta =>
        createOwnedStagedImage(new Date(now.getTime() - 24 * HOUR + delta), false, user),
      ),
    )
    const storage = await seedOwnedUploadCleanupStorage(ids)
    const result = await cleanupOwnedTestUploads(cleanupAbandonedUploads, ids, now)
    expect(result.cleaned).toBe(1)
    await expect(storage.deleted()).resolves.toEqual([
      { Bucket: S3Buckets.imageUploads, Key: ids[0] },
    ])
    expect(await getImageById(ids[0]!)).toBeNull()
    expect(await getImageById(ids[1]!)).not.toBeNull()
    expect(await getImageById(ids[2]!)).not.toBeNull()
  })
})
