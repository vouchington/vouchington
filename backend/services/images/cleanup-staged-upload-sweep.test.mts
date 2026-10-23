import { afterEach, describe, expect, it, vi } from 'vitest'
import { S3Buckets } from '@modules/aws'
import { mintUUIDv7 } from '@modules/utils/ids'
import { createTestUser, overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers'
import { createOwnedStagedSweepInterval } from '@voucha/test-helpers/image-upload-staged-sweep'
import { installOwnedUploadCleanupStorage } from '@voucha/test-helpers/image-upload-cleanup-storage'
import type { StagedUploadCleanupSweep } from '@queues/content-analysis/types'
import { parseCleanupAbandonedUploadsData } from '@queues/content-analysis/payload/upload-cleanup'
import { cleanupStagedUploadSweepPage } from './cleanup-staged-upload-sweep.mts'
import { getImageById, getImageByIdFromPrimary } from './get.mts'
import { imagesWorkConfig } from './work-limits.mts'

const preciseTimestamp = (date: Date) => date.toISOString().replace(/Z$/, '000Z')

function retainedState(staged: StagedUploadCleanupSweep): StagedUploadCleanupSweep {
  const parsed = parseCleanupAbandonedUploadsData({ staged }).staged
  if (!parsed) throw new Error('Staged cleanup state did not survive the retained payload parser')
  return parsed
}

describe('staged upload cleanup sweep', () => {
  afterEach(() => vi.restoreAllMocks())

  it('rejects a retained cursor outside its upper bound or with a rounded timestamp', () => {
    const prefix = mintUUIDv7().slice(0, -4)
    const stagedAt = preciseTimestamp(new Date(Date.now() - 2 * 60 * 60 * 1000))
    const valid: StagedUploadCleanupSweep = {
      cutoff: preciseTimestamp(new Date()),
      upper: { stagedAt, id: `${prefix}0001` },
      after: { stagedAt, id: `${prefix}0000` },
      done: false,
    }
    expect(retainedState(valid)).toEqual(valid)
    expect(() => retainedState({ ...valid, after: { stagedAt, id: `${prefix}0002` } })).toThrow(
      'Invalid staged upload cleanup cursor range',
    )
    expect(() => retainedState({ ...valid, cutoff: new Date().toISOString() })).toThrow(
      'Invalid staged upload cleanup snapshot',
    )
  })

  it('persists each owned physical page after S3 effects and reaches exact EOF', async () => {
    const user = await createTestUser()
    const { anchor, first, last, stagedAt } = await createOwnedStagedSweepInterval(user.id)
    const completedKeys: string[] = []
    const storage = installOwnedUploadCleanupStorage([first, last], async input => {
      await Promise.resolve()
      completedKeys.push(input.Key!)
    })
    const restoreBatch = overrideDynamicConfigFieldsForTest(imagesWorkConfig, {
      cleanup_batch_size: 1,
    })
    const saved: StagedUploadCleanupSweep[] = []
    const sweep: StagedUploadCleanupSweep = {
      cutoff: preciseTimestamp(new Date(stagedAt.getTime() + 60 * 60 * 1000)),
      upper: { stagedAt: preciseTimestamp(stagedAt), id: last },
      after: { stagedAt: preciseTimestamp(stagedAt), id: anchor },
      done: false,
    }
    try {
      const firstPage = await cleanupStagedUploadSweepPage(retainedState(sweep), async position => {
        expect(storage.calls).toHaveLength(1)
        expect(completedKeys).toEqual([first])
        expect((await getImageByIdFromPrimary(first))?.upload_source_deleted_at).toBeInstanceOf(
          Date,
        )
        saved.push(retainedState(position))
      })
      expect(firstPage).toEqual({ stagedSourcesDeleted: 1, hasMore: true })
      expect(saved[0]).toMatchObject({ after: { id: first }, done: false })
      expect((await getImageById(first))?.upload_source_deleted_at).toBeInstanceOf(Date)
      expect((await getImageById(last))?.upload_source_deleted_at).toBeNull()

      const secondPage = await cleanupStagedUploadSweepPage(saved[0]!, async position => {
        expect(storage.calls).toHaveLength(2)
        expect(completedKeys).toEqual([first, last])
        expect((await getImageByIdFromPrimary(last))?.upload_source_deleted_at).toBeInstanceOf(Date)
        saved.push(retainedState(position))
      })
      expect(secondPage).toEqual({ stagedSourcesDeleted: 1, hasMore: false })
      expect(saved[1]).toMatchObject({ after: { id: last }, done: true })
      expect((await getImageById(last))?.upload_source_deleted_at).toBeInstanceOf(Date)
      expect((await getImageById(anchor))?.upload_source_deleted_at).toBeInstanceOf(Date)
      expect(storage.calls).toEqual(
        [first, last].map(Key => ({ Bucket: S3Buckets.imageUploads, Key })),
      )
    } finally {
      restoreBatch()
    }
  })

  it('retains its position when owned storage fails, then retries that key', async () => {
    const user = await createTestUser()
    const { anchor, first, last, stagedAt } = await createOwnedStagedSweepInterval(user.id)
    let failOnce = true
    const storage = installOwnedUploadCleanupStorage([first, last], async input => {
      if (input.Key === first && failOnce) {
        failOnce = false
        throw new Error('owned synthetic S3 failure')
      }
    })
    const restoreBatch = overrideDynamicConfigFieldsForTest(imagesWorkConfig, {
      cleanup_batch_size: 1,
    })
    const saved: StagedUploadCleanupSweep[] = []
    const sweep: StagedUploadCleanupSweep = {
      cutoff: preciseTimestamp(new Date(stagedAt.getTime() + 60 * 60 * 1000)),
      upper: { stagedAt: preciseTimestamp(stagedAt), id: last },
      after: { stagedAt: preciseTimestamp(stagedAt), id: anchor },
      done: false,
    }
    try {
      await expect(
        cleanupStagedUploadSweepPage(retainedState(sweep), async position => {
          saved.push(retainedState(position))
        }),
      ).rejects.toThrow('retain the sweep position')
      expect(saved).toEqual([])
      expect((await getImageById(first))?.upload_source_deleted_at).toBeNull()
      expect((await getImageById(last))?.upload_source_deleted_at).toBeNull()
      await cleanupStagedUploadSweepPage(retainedState(sweep), async position => {
        saved.push(retainedState(position))
      })
      expect(saved).toMatchObject([{ after: { id: first }, done: false }])
      expect(storage.calls.map(call => call.Key)).toEqual([first, first])
    } finally {
      restoreBatch()
    }
  })

  it('replays an unsaved position after storage settled without deleting that source twice', async () => {
    const user = await createTestUser()
    const { anchor, first, last, stagedAt } = await createOwnedStagedSweepInterval(user.id)
    const storage = installOwnedUploadCleanupStorage([first, last])
    const restoreBatch = overrideDynamicConfigFieldsForTest(imagesWorkConfig, {
      cleanup_batch_size: 1,
    })
    const sweep: StagedUploadCleanupSweep = {
      cutoff: preciseTimestamp(new Date(stagedAt.getTime() + 60 * 60 * 1000)),
      upper: { stagedAt: preciseTimestamp(stagedAt), id: last },
      after: { stagedAt: preciseTimestamp(stagedAt), id: anchor },
      done: false,
    }
    try {
      await expect(
        cleanupStagedUploadSweepPage(retainedState(sweep), async position => {
          retainedState(position)
          throw new Error('owned synthetic checkpoint failure')
        }),
      ).rejects.toThrow('owned synthetic checkpoint failure')
      expect((await getImageByIdFromPrimary(first))?.upload_source_deleted_at).toBeInstanceOf(Date)
      const saved: StagedUploadCleanupSweep[] = []
      const result = await cleanupStagedUploadSweepPage(retainedState(sweep), async position => {
        saved.push(retainedState(position))
      })
      expect(result).toEqual({ stagedSourcesDeleted: 1, hasMore: false })
      expect(saved).toMatchObject([{ after: { id: last }, done: true }])
      expect(storage.calls.map(call => call.Key)).toEqual([first, last])
    } finally {
      restoreBatch()
    }
  })

  it('settles the bounded storage group before saving its position', async () => {
    const user = await createTestUser()
    const { anchor, first, last, stagedAt } = await createOwnedStagedSweepInterval(user.id)
    let active = 0
    let peak = 0
    const storage = installOwnedUploadCleanupStorage([first, last], async () => {
      active += 1
      peak = Math.max(peak, active)
      await Promise.resolve()
      active -= 1
    })
    const restoreBatch = overrideDynamicConfigFieldsForTest(imagesWorkConfig, {
      cleanup_batch_size: 2,
    })
    try {
      const result = await cleanupStagedUploadSweepPage(
        retainedState({
          cutoff: preciseTimestamp(new Date(stagedAt.getTime() + 60 * 60 * 1000)),
          upper: { stagedAt: preciseTimestamp(stagedAt), id: last },
          after: { stagedAt: preciseTimestamp(stagedAt), id: anchor },
          done: false,
        }),
        async position => {
          expect(storage.calls).toHaveLength(2)
          retainedState(position)
        },
      )
      expect(result).toEqual({ stagedSourcesDeleted: 2, hasMore: false })
      expect(peak).toBe(2)
      expect(storage.calls.map(call => call.Key)).toEqual([first, last])
    } finally {
      restoreBatch()
    }
  })
})
