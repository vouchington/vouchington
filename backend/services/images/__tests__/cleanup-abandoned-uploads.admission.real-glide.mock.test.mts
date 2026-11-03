import { randomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createTestUser, setImageHashAndProcessing, readAllQueueJobs } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  insertOwnedUploadCleanupCluster,
  makeOwnedUploadCleanupSweep,
} from '@voucha/test-helpers/image-upload-cleanup'
import type { AbandonedUploadSweep } from '@queues/content-analysis/types'
import { imageUploadsQueue } from '@queues/image-uploads/queues'
import { cleanupAbandonedUploads } from '../cleanup-abandoned-uploads.mts'
import { imagesWorkConfig } from '../work-limits.mts'

// A random Valkey database gives this file a private `voucha_qdb_<n>` queue namespace.
vi.hoisted(() => {
  const url = new URL(process.env.VALKEY_URL || 'redis://localhost:6379')
  url.pathname = String(crypto.getRandomValues(new Uint32Array(1))[0])
  vi.stubEnv('VALKEY_WORKER_QUEUE_URL', url.toString())
})
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
    context.onTestFinished(() => imageUploadsQueue.obliterate({ force: true }))
    context.onTestFinished(
      overrideDynamicConfigFieldsForTest(imagesWorkConfig, { cleanup_batch_size: 1 }),
    )
    const add = vi.spyOn(imageUploadsQueue, 'add').mockRejectedValueOnce(new Error('queue closed'))
    await expect(cleanupAbandonedUploads(sweep, save)).rejects.toThrow(
      'Upload cleanup page effects failed',
    )
    add.mockRestore()
    expect(saved).toEqual([])
    expect(sweep.windows.recovery.after?.id).not.toBe(ids[0])

    expect(await cleanupAbandonedUploads(sweep, save)).toMatchObject({
      recovered: 1,
      hasMore: true,
    })
    expect(saved[0]?.windows.recovery).toMatchObject({ after: { id: ids[0] }, done: false })
    expect((await readAllQueueJobs(imageUploadsQueue)).map(job => job.data)).toEqual([
      { id: ids[0] },
    ])

    // A lost checkpoint replays the admitted page through the production deduplication boundary.
    await cleanupAbandonedUploads(sweep, async () => {})
    expect((await readAllQueueJobs(imageUploadsQueue)).map(job => job.data)).toEqual([
      { id: ids[0] },
    ])
    const next = saved[0]
    if (!next) throw new Error('Missing successful recovery checkpoint')
    expect(await cleanupAbandonedUploads(next, save)).toMatchObject({
      recovered: 1,
      hasMore: false,
    })
    expect(saved.at(-1)?.windows.recovery).toMatchObject({ after: { id: ids[1] }, done: true })
    expect((await readAllQueueJobs(imageUploadsQueue)).map(job => job.data)).toEqual(
      ids.map(id => ({ id })),
    )
  })
})
