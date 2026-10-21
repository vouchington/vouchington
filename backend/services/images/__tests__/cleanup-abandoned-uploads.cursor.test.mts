import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  backdateImageUploadStagedAt,
  setImageHashAndProcessing,
} from '@voucha/test-helpers'
import {
  insertOwnedUploadCleanupCluster,
  makeOwnedUploadCleanupSweep,
} from '@voucha/test-helpers/image-upload-cleanup'
import { installOwnedUploadCleanupStorage } from '@voucha/test-helpers/image-upload-cleanup-storage'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import type { AbandonedUploadSweep } from '@queues/content-analysis/types'
import { randomBytes } from 'node:crypto'
import { cleanupAbandonedUploads } from '../cleanup-abandoned-uploads.mts'
import { initializeAbandonedUploadSweep } from '../cleanup-upload-sweep.mts'
import { imagesWorkConfig } from '../work-limits.mts'
import { getImageById } from '../get.mts'

const HOUR = 60 * 60 * 1000

describe('abandoned upload cursor windows', () => {
  afterEach(() => vi.restoreAllMocks())

  it('captures production root windows without mutating images or calling storage', async () => {
    const user = await createTestUser()
    const now = new Date()
    const ids = await insertOwnedUploadCleanupCluster(
      user.id,
      3,
      new Date(now.getTime() - 25 * HOUR),
    )
    const [completed, recovery, pending] = ids
    if (!completed || !recovery || !pending) throw new Error('Missing root capture fixtures')
    await backdateImageUploadStagedAt(completed, new Date(now.getTime() - 25 * HOUR), 'complete')
    await setImageHashAndProcessing(recovery, randomBytes(32))
    const before = await Promise.all(ids.map(id => getImageById(id, true)))
    const [completedBefore, recoveryBefore, pendingBefore] = before
    if (!completedBefore || !recoveryBefore || !pendingBefore)
      throw new Error('Owned root capture fixtures disappeared')
    expect(completedBefore.upload_source_deleted_at).toBeNull()
    expect(completedBefore.upload_completed_at).toBeInstanceOf(Date)
    expect(recoveryBefore.deleted_at).toBeNull()
    expect(recoveryBefore.upload_completed_at).toBeNull()
    expect(recoveryBefore.upload_failed_at).toBeNull()
    expect(recoveryBefore.sha_256?.toString('hex')).toBe(recoveryBefore.s3_key)
    expect(recoveryBefore.upload_started_at).toBeInstanceOf(Date)
    expect(pendingBefore.deleted_at).toBeNull()
    expect(pendingBefore.upload_completed_at).toBeNull()
    expect(pendingBefore.upload_failed_at).toBeNull()
    expect(pendingBefore.upload_started_at).toBeNull()
    expect(pendingBefore.sha_256).toBeNull()
    const [stagedOwned, recoveryOwned, abandonmentOwned] = await Promise.all([
      makeOwnedUploadCleanupSweep([completed], now),
      makeOwnedUploadCleanupSweep([recovery], now),
      makeOwnedUploadCleanupSweep([pending], now),
    ])
    const ownedKeys = {
      staged: stagedOwned.windows.staged.upper,
      recovery: recoveryOwned.windows.recovery.upper,
      abandonment: abandonmentOwned.windows.abandonment.upper,
    }
    const storage = installOwnedUploadCleanupStorage(ids)
    const sweep = await initializeAbandonedUploadSweep()
    expect(Date.parse(sweep.recoveryCutoff) - Date.parse(sweep.abandonmentCutoff)).toBe(23 * HOUR)
    for (const phase of ['staged', 'recovery', 'abandonment'] as const) {
      const window = sweep.windows[phase]
      expect(window.done).toBe(false)
      expect(window.upper).not.toBeNull()
      if (!window.upper) throw new Error(`Root capture lost eligible ${phase} fixture`)
      const cutoff = phase === 'abandonment' ? sweep.abandonmentCutoff : sweep.recoveryCutoff
      expect(Date.parse(window.upper.stagedAt)).toBeLessThan(Date.parse(cutoff))
      const ownedKey = ownedKeys[phase]
      if (!ownedKey) throw new Error(`Missing owned ${phase} tuple`)
      expect(
        `${window.upper.stagedAt}|${window.upper.id}` >= `${ownedKey.stagedAt}|${ownedKey.id}`,
      ).toBe(true)
    }
    expect(await Promise.all(ids.map(id => getImageById(id, true)))).toEqual(before)
    expect(storage.calls).toEqual([])
  })

  it('persists applied progress after storage effects and leaves the B+1 witness for continuation', async () => {
    await imagesWorkConfig.waitForInitialization()
    const user = await createTestUser()
    const now = new Date()
    const ids = await insertOwnedUploadCleanupCluster(
      user.id,
      3,
      new Date(now.getTime() - 25 * HOUR),
    )
    const [first, witness, outside] = ids
    if (!first || !witness || !outside) throw new Error('Missing bounded page fixtures')
    const sweep = await makeOwnedUploadCleanupSweep(ids.slice(0, 2), now)
    sweep.windows.staged.done = true
    sweep.windows.recovery.done = true
    const started = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const saved: AbandonedUploadSweep[] = []
    let held = false
    const storage = installOwnedUploadCleanupStorage(ids.slice(0, 2), async () => {
      if (!held) {
        held = true
        started.resolve()
        await release.promise
      }
    })
    const restoreConfig = overrideDynamicConfigFieldsForTest(imagesWorkConfig, {
      cleanup_batch_size: 1,
    })
    try {
      const pass = cleanupAbandonedUploads(sweep, async state => {
        saved.push(state)
      })
      void pass.catch(() => {})
      try {
        await started.promise
        expect(saved).toEqual([])
        expect(await getImageById(witness)).not.toBeNull()
        expect(await getImageById(outside)).not.toBeNull()
      } finally {
        release.resolve()
      }
      expect(await pass).toMatchObject({ cleaned: 1, hasMore: true })
      expect(saved).toHaveLength(1)
      const resumed = saved[0]
      if (!resumed) throw new Error('Bounded cleanup did not save progress')
      expect(resumed.windows.abandonment.after?.id).toBe(first)
      expect(resumed.windows.abandonment.done).toBe(false)
      expect(storage.calls.map(call => call.Key)).toEqual([first])
      const second = await cleanupAbandonedUploads(resumed, async state => {
        saved.push(state)
      })
      expect(second).toMatchObject({ cleaned: 1, hasMore: false })
      expect(saved.at(-1)?.windows.abandonment.after?.id).toBe(witness)
      expect(await getImageById(witness)).toBeNull()
      expect(await getImageById(outside)).not.toBeNull()
    } finally {
      release.resolve()
      restoreConfig()
    }
  })
})
