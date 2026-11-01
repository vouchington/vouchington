import { describe, expect, it, vi } from 'vitest'

import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import { background } from '@queues/background/queues'
import { SCHEDULE_DEFINITIONS } from '../../../entrypoints/worker-cpu/schedule-definitions.mts'
import { SCHEDULED_JOB_MANIFESTS } from '@services/queue-monitoring/scheduled-job-manifests'

describe('scheduled job export consumption', () => {
  it('registers every cataloged background scheduler in the one combined background registration', async () => {
    // Registration removes every scheduler the combined manifest omits, so this call must list
    // every background scheduler the catalog publishes.
    const catalogManifest = SCHEDULED_JOB_MANIFESTS.find(
      manifest => manifest.queueName === BACKGROUND_QUEUE_NAME,
    )
    const definition = SCHEDULE_DEFINITIONS.find(
      candidate => candidate.queueName === BACKGROUND_QUEUE_NAME,
    )
    if (catalogManifest === undefined || definition === undefined) {
      throw new Error('background schedule catalog or worker definition is missing')
    }
    const domainSchedulerIds = catalogManifest.jobs.map(job => job.schedulerId)
    const upsert = vi.spyOn(background, 'upsertJobScheduler').mockResolvedValue(undefined)
    try {
      await (
        await definition.load()
      )()

      expect(upsert.mock.calls.map(([schedulerId]) => schedulerId).toSorted()).toEqual(
        domainSchedulerIds.toSorted(),
      )
    } finally {
      upsert.mockRestore()
    }
  })
})
