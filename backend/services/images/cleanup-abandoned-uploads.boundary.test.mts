import { randomBytes } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { onEnqueueAdmission } from '@data-stores/valkey-glide-mq/glide-mq-admission'
import { imageUploadsQueue } from '@queues/image-uploads/queues'
import {
  backdateImageUploadStagedAt,
  createTestUser,
  setImageHashAndProcessing,
} from '@voucha/test-helpers'
import { cleanupAbandonedUploads } from './cleanup-abandoned-uploads.mts'
import { createImageUploadUrl } from './create-upload-url.mts'
import { getImageById } from './get.mts'
import * as s3Module from './s3-upload-lifecycle.mts'

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

describe('abandoned upload exact cutoff boundaries', () => {
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
    vi.spyOn(s3Module, 'deleteImageUploadSourceFromS3').mockResolvedValue(undefined)
    const admitted: string[] = []
    const off = onEnqueueAdmission(event => {
      const input = event.inputs[0]
      if (
        event.queue === imageUploadsQueue &&
        event.jobName === 'extract-metadata' &&
        input &&
        typeof input === 'object' &&
        'id' in input &&
        typeof input.id === 'string' &&
        ids.includes(input.id)
      ) {
        admitted.push(input.id)
      }
      return undefined
    })
    try {
      const result = await cleanupAbandonedUploads({ imageIds: ids, now })
      expect(result.recovered).toBe(1)
      expect(result.cleaned).toBe(0)
      expect(admitted).toEqual([ids[0]])
      for (const id of ids) expect(await getImageById(id)).not.toBeNull()
    } finally {
      off()
    }
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
    const deleteStorage = vi
      .spyOn(s3Module, 'deleteKnownImageStorageFromS3')
      .mockResolvedValue(undefined)

    const result = await cleanupAbandonedUploads({ imageIds: ids, now })

    expect(result.cleaned).toBe(1)
    expect(result.recovered).toBe(0)
    expect(deleteStorage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: ids[0] }))
    expect(await getImageById(ids[0]!)).toBeNull()
    expect(await getImageById(ids[1]!)).not.toBeNull()
    expect(await getImageById(ids[2]!)).not.toBeNull()
  })
})
