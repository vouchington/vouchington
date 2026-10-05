import { runIsolatedDatabaseCase } from '../../../../test-helpers/vitest-isolated-database-case.mts'
import { getIsolatedDatabaseCaseMode } from '../../../../test-helpers/vitest-isolated-database-cases.mts'
import { afterAll, describe, expect, it } from 'vitest'
import type { Job } from 'glide-mq'
import { handleImagesJob, images } from './images.mts'

describe('images worker', () => {
  afterAll(async () => {
    await images.close()
  }, 240_000)

  it('cleans abandoned uploads from the worker job', async () => {
    if (getIsolatedDatabaseCaseMode('images-abandoned-upload-cleanup') === 'parent') {
      await runIsolatedDatabaseCase('images-abandoned-upload-cleanup')
      return
    }
    await expect(
      handleImagesJob({ name: 'cleanup-abandoned-uploads' } as Job<{ id: string }>),
    ).resolves.toEqual({
      cleaned: expect.any(Number),
      recovered: expect.any(Number),
      stagedSourcesDeleted: expect.any(Number),
    })
  }, 240_000)
})
