import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createTestUser, setImageIdAndUploadStatus } from '@voucha/test-helpers'
import type { PrivateUser } from '@voucha/types/entities/user'
import { cleanupAbandonedUploads } from './cleanup-abandoned-uploads.mts'
import { createImageUploadUrl } from './create-upload-url.mts'
import * as imageStorage from './s3-upload-lifecycle.mts'

describe('cleanupAbandonedUploads staged-source concurrency', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('bounds cleanup above the advisory-lock pool size', async () => {
    const imageIds = await Promise.all(
      Array.from({ length: 5 }, async () => {
        const { image_id } = await createImageUploadUrl(user, {
          contentType: 'image/jpeg',
          contentLength: 1024,
        })
        const oldId = oldUuidV7()
        await setImageIdAndUploadStatus(image_id, oldId, 'complete')
        return oldId
      }),
    )
    let active = 0
    let maximumActive = 0
    const saturated = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    vi.spyOn(imageStorage, 'deleteImageUploadSourceFromS3').mockImplementation(async image => {
      if (!imageIds.includes(image.id)) return
      active += 1
      maximumActive = Math.max(maximumActive, active)
      if (active === 4) saturated.resolve()
      await release.promise
      active -= 1
    })

    const cleanup = cleanupAbandonedUploads()
    await saturated.promise
    expect(maximumActive).toBe(4)
    release.resolve()
    const result = await cleanup

    expect(result.stagedSourcesDeleted).toBeGreaterThanOrEqual(imageIds.length)
  })
})

function oldUuidV7(): string {
  const milliseconds = Date.now() - 2 * 60 * 60 * 1000
  const timestamp = milliseconds.toString(16).padStart(12, '0')
  return `${timestamp.slice(0, 8)}-${timestamp.slice(8)}-7000-8000-${randomUUID().slice(24)}`
}
