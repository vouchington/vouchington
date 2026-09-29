import { afterAll, describe, expect, it } from 'vitest'
import type { Job } from 'glide-mq'
import { handleImagesJob, images } from './images.mts'

describe('images worker', () => {
  afterAll(async () => {
    await images.close()
  })

  it('cleans abandoned uploads from the worker job', async () => {
    await expect(
      handleImagesJob({ name: 'cleanup-abandoned-uploads' } as Job<{ id: string }>),
    ).resolves.toEqual({
      cleaned: expect.any(Number),
      recovered: expect.any(Number),
      stagedSourcesDeleted: expect.any(Number),
    })
  })
})
