import { createOwnedUploadRecoveryQueue } from '@voucha/test-helpers/image-upload-cleanup-queue'
import { randomBytes } from 'node:crypto'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import {
  onEnqueueAdmission,
  type EnqueueAdmission,
} from '@data-stores/valkey-glide-mq/glide-mq-admission'
import { readEnqueuedJob } from '@voucha/test-helpers/queue-jobs'
import {
  backdateImageUploadStagedAt,
  createTestUser,
  setImageHashAndProcessing,
} from '@voucha/test-helpers'
import { cleanupAbandonedUploads } from './cleanup-abandoned-uploads.mts'
import { createImageUploadUrl } from './create-upload-url.mts'
import { getImageById } from './get.mts'
import { cleanupOwnedTestUploads } from '@voucha/test-helpers/image-upload-cleanup'
import { installOwnedUploadCleanupStorage } from '@voucha/test-helpers/image-upload-cleanup-storage'
import { S3Buckets } from '@modules/aws'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const UTC_ROLLOVERS = [
  '2025-01-31T23:59:59.999Z',
  '2025-02-01T00:00:00.001Z',
  '2024-02-29T23:59:59.999Z',
  '2024-03-01T00:00:00.001Z',
  '2025-12-31T23:59:59.999Z',
  '2026-01-01T00:00:00.001Z',
] as const

let recoveryTarget: ReturnType<typeof createOwnedUploadRecoveryQueue>
const runCleanup: typeof cleanupAbandonedUploads = (sweep, save) =>
  cleanupAbandonedUploads(sweep, save, recoveryTarget.queue)
describe('abandoned upload exact cutoff boundaries', () => {
  beforeEach(context => {
    const target = createOwnedUploadRecoveryQueue()
    recoveryTarget = target
    context.onTestFinished(() => target.close())
  })

  afterEach(() => vi.restoreAllMocks())

  it.each(UTC_ROLLOVERS)('enqueues recovery only before the one-hour edge at %s', async instant => {
    const now = new Date(instant)
    const user = await createTestUser()
    const ids: string[] = []
    for (const delta of [-1, 0, 1]) {
      const upload = await createImageUploadUrl(user, {
        contentType: 'image/jpeg',
        contentLength: 1024,
      })
      await backdateImageUploadStagedAt(upload.image_id, new Date(now.getTime() - HOUR_MS + delta))
      await setImageHashAndProcessing(upload.image_id, randomBytes(32))
      ids.push(upload.image_id)
    }
    installOwnedUploadCleanupStorage(ids)
    const admissions: EnqueueAdmission[] = []
    const off = onEnqueueAdmission(event => {
      const input = event.inputs[0]
      if (
        event.queue === recoveryTarget.queue &&
        event.jobName === 'extract-metadata' &&
        input &&
        typeof input === 'object' &&
        'id' in input &&
        typeof input.id === 'string' &&
        ids.includes(input.id)
      ) {
        admissions.push(event)
      }
      return undefined
    })
    let result: Awaited<ReturnType<typeof cleanupOwnedTestUploads>> | undefined
    try {
      result = await cleanupOwnedTestUploads(runCleanup, ids, now)
    } finally {
      off()
      await Promise.allSettled(admissions.map(admission => admission.completion))
    }

    if (!result) throw new Error('Image cleanup did not return a result')
    expect(result.recovered).toBe(1)
    expect(result.cleaned).toBe(0)
    expect(admissions).toHaveLength(1)
    for (const id of ids) expect(await getImageById(id)).not.toBeNull()
    const [expectedId] = ids
    if (!expectedId) throw new Error('Missing owned image upload ID')
    const jobs = await Promise.all(
      admissions.map(async admission =>
        readEnqueuedJob(recoveryTarget.queue, await admission.completion),
      ),
    )
    expect(jobs.map(job => job.data)).toEqual([{ id: expectedId }])
  })

  it.each(UTC_ROLLOVERS)('abandons only before the 24-hour edge at %s', async instant => {
    const now = new Date(instant)
    const user = await createTestUser()
    const ids: string[] = []
    for (const delta of [-1, 0, 1]) {
      const upload = await createImageUploadUrl(user, {
        contentType: 'image/jpeg',
        contentLength: 1024,
      })
      await backdateImageUploadStagedAt(upload.image_id, new Date(now.getTime() - DAY_MS + delta))
      ids.push(upload.image_id)
    }
    const storage = installOwnedUploadCleanupStorage(ids)

    const result = await cleanupOwnedTestUploads(runCleanup, ids, now)

    expect(result.cleaned).toBe(1)
    expect(result.recovered).toBe(0)
    expect(storage.calls).toEqual([{ Bucket: S3Buckets.imageUploads, Key: ids[0] }])
    expect(await getImageById(ids[0]!)).toBeNull()
    expect(await getImageById(ids[1]!)).not.toBeNull()
    expect(await getImageById(ids[2]!)).not.toBeNull()
  })
})
