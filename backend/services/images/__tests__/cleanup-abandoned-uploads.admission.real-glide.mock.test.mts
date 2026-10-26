import { randomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createTestUser, setImageHashAndProcessing, readAllQueueJobs } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { createOwnedUploadRecoveryQueue } from '@voucha/test-helpers/image-upload-cleanup-queue'
import {
  insertOwnedUploadCleanupCluster,
  makeOwnedUploadCleanupSweep,
} from '@voucha/test-helpers/image-upload-cleanup'
import type { AbandonedUploadSweep } from '@queues/content-analysis/types'
import { cleanupAbandonedUploads } from '../cleanup-abandoned-uploads.mts'
import { imagesWorkConfig } from '../work-limits.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('abandoned upload recovery admission', () => {
  it('retains a rejected page, bounds successful admission, and deduplicates its replay', async context => {
    await imagesWorkConfig.waitForInitialization()
    const user = await createTestUser()
    const now = new Date()
    const ids = await insertOwnedUploadCleanupCluster(
      user.id,
      2,
      new Date(now.getTime() - 2 * 60 * 60 * 1000),
    )
    await Promise.all(ids.map(id => setImageHashAndProcessing(id, randomBytes(32))))
    const sweep = await makeOwnedUploadCleanupSweep(ids, now)
    sweep.windows.staged.done = true
    sweep.windows.abandonment.done = true
    const saved: AbandonedUploadSweep[] = []
    const save = async (next: AbandonedUploadSweep) => {
      saved.push(next)
    }
    const rejected = createOwnedUploadRecoveryQueue()
    await rejected.close()
    context.onTestFinished(
      overrideDynamicConfigFieldsForTest(imagesWorkConfig, { cleanup_batch_size: 1 }),
    )
    await expect(
      cleanupAbandonedUploads(sweep, save, { recoveryQueue: rejected.queue }),
    ).rejects.toThrow('Upload cleanup page effects failed')
    expect(saved).toEqual([])
    expect(sweep.windows.recovery.after?.id).not.toBe(ids[0])

    const target = createOwnedUploadRecoveryQueue()
    context.onTestFinished(() => target.close())
    expect(
      await cleanupAbandonedUploads(sweep, save, { recoveryQueue: target.queue }),
    ).toMatchObject({
      recovered: 1,
      hasMore: true,
    })
    expect(saved[0]?.windows.recovery).toMatchObject({ after: { id: ids[0] }, done: false })
    expect((await readAllQueueJobs(target.queue)).map(job => job.data)).toEqual([{ id: ids[0] }])

    // A lost checkpoint replays the admitted page through the production deduplication boundary.
    await cleanupAbandonedUploads(sweep, async () => {}, { recoveryQueue: target.queue })
    expect((await readAllQueueJobs(target.queue)).map(job => job.data)).toEqual([{ id: ids[0] }])
    const next = saved[0]
    if (!next) throw new Error('Missing successful recovery checkpoint')
    expect(
      await cleanupAbandonedUploads(next, save, { recoveryQueue: target.queue }),
    ).toMatchObject({
      recovered: 1,
      hasMore: false,
    })
    expect(saved.at(-1)?.windows.recovery).toMatchObject({ after: { id: ids[1] }, done: true })
    expect((await readAllQueueJobs(target.queue)).map(job => job.data)).toEqual(
      ids.map(id => ({ id })),
    )
  })
})
