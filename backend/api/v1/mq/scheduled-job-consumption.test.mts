import { globSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { ScheduledJobManifest } from '@modules/scheduled-job-manifest'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import { BACKGROUND_CPU_QUEUE_NAME } from '@queues/background-cpu/config'
import { background } from '@queues/background/queues'
import { SCHEDULE_DEFINITIONS } from '../../../entrypoints/worker-cpu/schedule-definitions.mts'
import { SCHEDULED_JOB_MANIFESTS } from '@services/queue-monitoring/scheduled-job-manifests'

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url))
// Shared queue packages own combined registrations, not domain manifests of their own.
const schedulePaths = globSync('backend/queues/*/enqueues/schedules.mts', {
  cwd: repoRoot,
})
  .filter(
    path =>
      !path.startsWith('backend/queues/background/') &&
      !path.startsWith('backend/queues/background-cpu/'),
  )
  .toSorted()

// Shared-queue domains contribute manifests to one combined registration, so they have no
// `upsertSchedules` of their own: registering a domain's manifest alone would prune the others.
type ScheduleModule = {
  scheduledJobManifest: ScheduledJobManifest
  upsertSchedules?: () => Promise<void>
}

async function loadScheduleModules(): Promise<ScheduleModule[]> {
  return Promise.all(
    schedulePaths.map(async path => {
      const loadedModule = (await import(
        pathToFileURL(join(repoRoot, path)).href
      )) as ScheduleModule
      expect(loadedModule.scheduledJobManifest).toBeDefined()
      const combinedQueue =
        loadedModule.scheduledJobManifest.queueName === BACKGROUND_QUEUE_NAME ||
        loadedModule.scheduledJobManifest.queueName === BACKGROUND_CPU_QUEUE_NAME
      expect(typeof loadedModule.upsertSchedules).toBe(combinedQueue ? 'undefined' : 'function')
      return loadedModule
    }),
  )
}

describe('scheduled job export consumption', () => {
  it('consumes every discovered manifest in the API catalog', async () => {
    const modules = await loadScheduleModules()
    const combinedQueues = [BACKGROUND_QUEUE_NAME, BACKGROUND_CPU_QUEUE_NAME]
    const own = modules.filter(
      module => !combinedQueues.includes(module.scheduledJobManifest.queueName),
    )
    const combined = SCHEDULED_JOB_MANIFESTS.filter(manifest =>
      combinedQueues.includes(manifest.queueName),
    )

    expect(
      new Set(SCHEDULED_JOB_MANIFESTS.filter(manifest => !combined.includes(manifest))),
    ).toEqual(new Set(own.map(module => module.scheduledJobManifest)))
    expect(combined).toHaveLength(combinedQueues.length)
    for (const queueName of combinedQueues) {
      const domainSchedulerIds = modules
        .filter(module => module.scheduledJobManifest.queueName === queueName)
        .flatMap(module => module.scheduledJobManifest.jobs.map(job => job.schedulerId))
        .toSorted()
      const catalogManifest = combined.find(manifest => manifest.queueName === queueName)
      expect(catalogManifest?.jobs.map(job => job.schedulerId).toSorted()).toEqual(
        domainSchedulerIds,
      )
    }
  })

  it('consumes every discovered upsert function in a worker runtime definition', async () => {
    const modules = await loadScheduleModules()
    const runtimeRegistrations = await Promise.all(
      SCHEDULE_DEFINITIONS.map(definition => definition.load()),
    )

    const ownRegistrations = modules.flatMap(module =>
      module.upsertSchedules ? [module.upsertSchedules] : [],
    )

    const combinedRegistrations = runtimeRegistrations.filter(
      register => !ownRegistrations.includes(register),
    )

    // Both shared queues register their domain manifests through one runtime schedule function.
    expect(combinedRegistrations).toHaveLength(2)
    expect(
      SCHEDULE_DEFINITIONS.filter((_, index) =>
        combinedRegistrations.includes(runtimeRegistrations[index]!),
      )
        .map(definition => definition.queueName)
        .toSorted(),
    ).toEqual([BACKGROUND_CPU_QUEUE_NAME, BACKGROUND_QUEUE_NAME].toSorted())
    expect(new Set(runtimeRegistrations)).toEqual(
      new Set([...ownRegistrations, ...combinedRegistrations]),
    )
  })

  it('registers every background domain manifest in the one combined background registration', async () => {
    const modules = await loadScheduleModules()
    const domainSchedulerIds = modules
      .filter(module => module.scheduledJobManifest.queueName === BACKGROUND_QUEUE_NAME)
      .flatMap(module => module.scheduledJobManifest.jobs.map(job => job.schedulerId))
    const definition = SCHEDULE_DEFINITIONS.find(
      candidate => candidate.queueName === BACKGROUND_QUEUE_NAME,
    )!
    const upsert = vi.spyOn(background, 'upsertJobScheduler').mockResolvedValue(undefined as never)
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
