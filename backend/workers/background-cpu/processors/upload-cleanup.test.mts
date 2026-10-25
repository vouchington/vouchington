import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { backgroundCpu } from '@queues/background-cpu/queues'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import { parseCleanupAbandonedUploadsData } from '@queues/content-analysis/payload/upload-cleanup'
import { getImageByIdFromPrimary } from '@services/images/get'
import { imagesWorkConfig } from '@services/images/work-limits'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { createOwnedStagedImage } from '@voucha/test-helpers/image-upload-cleanup-fixtures'
import { installOwnedUploadCleanupStorage } from '@voucha/test-helpers/image-upload-cleanup-storage'
import { BACKGROUND_CPU_HANDLERS } from './handlers.mts'

describe('upload cleanup processor', () => {
  afterEach(() => vi.restoreAllMocks())

  it('stops before global cleanup when its initial retained checkpoint fails', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(imagesWorkConfig, { abandoned_threshold_hours: 24 }),
    )
    const imageId = await createOwnedStagedImage(new Date(Date.now() - 25 * 60 * 60 * 1000))
    const definition = requireBackgroundCpuJob('content-analysis.cleanup-abandoned-uploads')
    const job = await backgroundCpu.add(definition.name, {}, definition.options)
    if (!job) throw new Error('Expected an owned cleanup job')
    onTestFinished(async () => {
      await job.remove()
    })
    const handler = BACKGROUND_CPU_HANDLERS.find(candidate => candidate.job.name === job.name)
    if (!handler) throw new Error('Expected the registered upload cleanup handler')
    const saved: unknown[] = []
    vi.spyOn(job, 'updateData').mockImplementation(async data => {
      saved.push(data)
      throw new Error('owned checkpoint failure')
    })
    const delay = vi.spyOn(job, 'moveToDelayed')
    const storage = installOwnedUploadCleanupStorage([imageId])
    await expect(handler.handle(job)).rejects.toThrow('owned checkpoint failure')
    expect(saved).toHaveLength(1)
    expect(parseCleanupAbandonedUploadsData(saved[0]).staged).toMatchObject({
      cutoff: expect.any(String),
      done: expect.any(Boolean),
    })
    expect((await backgroundCpu.getJob(job.id))?.data).toEqual({})
    expect(await getImageByIdFromPrimary(imageId, true)).toMatchObject({
      deleted_at: null,
      upload_source_deleted_at: null,
    })
    expect(delay).not.toHaveBeenCalled()
    expect(storage.calls).toEqual([])
  })
})
