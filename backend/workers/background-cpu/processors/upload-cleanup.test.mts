import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { backgroundCpu } from '@queues/background-cpu/queues'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import { parseCleanupAbandonedUploadsData } from '@queues/content-analysis/payload/upload-cleanup'
import { getImageByIdFromPrimary } from '@services/images/get'
import { imagesWorkConfig } from '@services/images/work-limits'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { createOwnedStagedImage } from '@voucha/test-helpers/image-upload-cleanup-fixtures'
import { installOwnedUploadCleanupStorage } from '@voucha/test-helpers/image-upload-cleanup-storage'
import { readImageDeletionRootRecoveryJobIds } from '@voucha/test-helpers/image-deletion'
import { BACKGROUND_CPU_HANDLERS } from './handlers.mts'

describe('upload cleanup processor', () => {
  afterEach(() => vi.restoreAllMocks())

  it('admits one recovery job across two sweep starts and stops at failed initial checkpoints', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(imagesWorkConfig, { abandoned_threshold_hours: 24 }),
    )
    const imageId = await createOwnedStagedImage(new Date(Date.now() - 25 * 60 * 60 * 1000))
    const definition = requireBackgroundCpuJob('content-analysis.cleanup-abandoned-uploads')
    const before = new Set(await readImageDeletionRootRecoveryJobIds())
    const jobs = await Promise.all([
      backgroundCpu.add(definition.name, {}, definition.options),
      backgroundCpu.add(definition.name, {}, definition.options),
    ])
    onTestFinished(async () => {
      await Promise.all(jobs.map(async job => job?.remove()))
    })
    const handler = BACKGROUND_CPU_HANDLERS.find(
      candidate => candidate.job.name === definition.name,
    )
    if (!handler) throw new Error('Expected the registered upload cleanup handler')
    const saved: unknown[] = []
    const storage = installOwnedUploadCleanupStorage([imageId])
    for (const job of jobs) {
      if (!job) throw new Error('Expected an owned cleanup job')
      vi.spyOn(job, 'updateData').mockImplementation(async data => {
        saved.push(data)
        throw new Error('owned checkpoint failure')
      })
      const delay = vi.spyOn(job, 'moveToDelayed')
      await expect(handler.handle(job)).rejects.toThrow('owned checkpoint failure')
      expect(delay).not.toHaveBeenCalled()
    }
    expect(saved).toHaveLength(2)
    for (const checkpoint of saved)
      expect(parseCleanupAbandonedUploadsData(checkpoint).sweep).toMatchObject({
        recoveryCutoff: expect.any(String),
        abandonmentCutoff: expect.any(String),
        windows: expect.any(Object),
      })
    expect(await Promise.all(jobs.map(job => backgroundCpu.getJob(job!.id)))).toMatchObject([
      { data: {} },
      { data: {} },
    ])
    const after = await readImageDeletionRootRecoveryJobIds()
    expect(after.filter(id => !before.has(id))).toEqual(
      before.has('image-deletion-recovery') ? [] : ['image-deletion-recovery'],
    )
    expect(after.filter(id => id === 'image-deletion-recovery')).toHaveLength(1)
    expect(await getImageByIdFromPrimary(imageId, true)).toMatchObject({
      deleted_at: null,
      upload_source_deleted_at: null,
    })
    expect(storage.calls).toEqual([])
  })
})
