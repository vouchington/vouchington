import { createOwnedUploadRecoveryQueue } from '@voucha/test-helpers/image-upload-cleanup-queue'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { backdateImageUploadStagedAt, createTestUser } from '@voucha/test-helpers'
import {
  insertOwnedUploadCleanupCluster,
  makeOwnedUploadCleanupSweep,
} from '@voucha/test-helpers/image-upload-cleanup'
import { installOwnedUploadCleanupStorage } from '@voucha/test-helpers/image-upload-cleanup-storage'
import { cleanupAbandonedUploads } from './cleanup-abandoned-uploads.mts'

let recoveryTarget: ReturnType<typeof createOwnedUploadRecoveryQueue>
const runCleanup: typeof cleanupAbandonedUploads = (sweep, save) =>
  cleanupAbandonedUploads(sweep, save, recoveryTarget.queue)
describe('cleanupAbandonedUploads staged-source concurrency', () => {
  beforeEach(context => {
    const target = createOwnedUploadRecoveryQueue()
    recoveryTarget = target
    context.onTestFinished(() => target.close())
  })

  afterEach(() => vi.restoreAllMocks())

  it('bounds cleanup above the advisory-lock pool size', async () => {
    const now = new Date()
    const stagedAt = new Date(now.getTime() - 2 * 60 * 60 * 1000)
    const user = await createTestUser()
    const ids = await insertOwnedUploadCleanupCluster(user.id, 5, stagedAt)
    await Promise.all(ids.map(id => backdateImageUploadStagedAt(id, stagedAt, 'complete')))
    let active = 0
    let maximumActive = 0
    const saturated = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const storage = installOwnedUploadCleanupStorage(ids, async () => {
      active += 1
      maximumActive = Math.max(maximumActive, active)
      if (active === 4) saturated.resolve()
      try {
        await release.promise
      } finally {
        active -= 1
      }
    })
    const sweep = await makeOwnedUploadCleanupSweep(ids, now)
    const cleanup = runCleanup(sweep, async () => {})
    void cleanup.catch(() => {})
    try {
      await saturated.promise
      expect(maximumActive).toBe(4)
    } finally {
      release.resolve()
    }
    const result = await cleanup
    expect(result.stagedSourcesDeleted).toBe(ids.length)
    expect(storage.calls.map(call => call.Key).toSorted()).toEqual([...ids].toSorted())
  })
})
