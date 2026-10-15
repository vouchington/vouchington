import { globSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { ScheduledJobManifest } from '@modules/scheduled-job-manifest'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import { background } from '@queues/background/queues'
import { SCHEDULE_DEFINITIONS } from '../../../entrypoints/worker-cpu/schedule-definitions.mts'
import { SCHEDULED_JOB_MANIFESTS } from '@services/queue-monitoring/scheduled-job-manifests'

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url))
// The background package owns the combined registration, not a manifest of its own.
const schedulePaths = globSync('backend/queues/*/enqueues/schedules.mts', {
  cwd: repoRoot,
})
  .filter(path => !path.startsWith('backend/queues/background/'))
  .toSorted()

// A background domain contributes its manifest to one combined registration, so it has no
// `upsertSchedules` of its own: registering a domain's manifest alone would prune the others.
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
      expect(typeof loadedModule.upsertSchedules).toBe(
        loadedModule.scheduledJobManifest.queueName === BACKGROUND_QUEUE_NAME
          ? 'undefined'
          : 'function',
      )
      return loadedModule
    }),
  )
}

describe('scheduled job export consumption', () => {
  it('consumes every discovered manifest in the API catalog', async () => {
    const modules = await loadScheduleModules()
    const own = modules.filter(
      module => module.scheduledJobManifest.queueName !== BACKGROUND_QUEUE_NAME,
    )
    const domainJobs = modules
      .filter(module => module.scheduledJobManifest.queueName === BACKGROUND_QUEUE_NAME)
      .flatMap(module => module.scheduledJobManifest.jobs)
    const combined = SCHEDULED_JOB_MANIFESTS.filter(
      manifest => manifest.queueName === BACKGROUND_QUEUE_NAME,
    )

    expect(
      new Set(SCHEDULED_JOB_MANIFESTS.filter(manifest => !combined.includes(manifest))),
    ).toEqual(new Set(own.map(module => module.scheduledJobManifest)))
    expect(combined).toHaveLength(1)
    expect(combined[0]!.jobs.map(job => job.schedulerId).toSorted()).toEqual(
      domainJobs.map(job => job.schedulerId).toSorted(),
    )
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

    expect(combinedRegistrations).toHaveLength(1)
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
