import { describe, expect, it, onTestFinished } from 'vitest'
import { PRIORITY_DEFAULT } from '@queues/psql/config'
import { psql } from '@queues/psql/queues'
import {
  MODERATION_TRANSPARENCY_RELEASE_JOB_NAME,
  moderationTransparencyReleaseSchedule,
} from './moderation-transparency-release.mts'

describe('moderation transparency release schedule', () => {
  it('manual trigger admits one release job on the single-concurrency lane', async () => {
    const [surface] = moderationTransparencyReleaseSchedule.operatorSurfaces
    const job = await surface.trigger()
    onTestFinished(async () => {
      await (await psql.getJob(String(job?.id)))?.remove()
    })

    expect(job?.name).toBe(MODERATION_TRANSPARENCY_RELEASE_JOB_NAME)
    expect(job?.opts).toMatchObject({
      priority: PRIORITY_DEFAULT,
      ordering: { key: 'psql:moderation-transparency-release', concurrency: 1 },
    })
  })
})
