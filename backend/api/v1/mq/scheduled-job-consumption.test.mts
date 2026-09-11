import { globSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ScheduledJobManifest } from '@modules/scheduled-job-manifest'
import { SCHEDULE_DEFINITIONS } from '../../../entrypoints/worker-cpu/schedule-definitions.mts'
import { SCHEDULED_JOB_MANIFESTS } from './scheduled-job-manifests.mts'

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url))
const schedulePaths = globSync('backend/queues/*/enqueues/schedules.mts', {
  cwd: repoRoot,
}).sort()

type ScheduleModule = {
  scheduledJobManifest: ScheduledJobManifest
  upsertSchedules: () => Promise<void>
}

async function loadScheduleModules(): Promise<ScheduleModule[]> {
  return Promise.all(
    schedulePaths.map(async path => {
      const loadedModule = (await import(
        pathToFileURL(join(repoRoot, path)).href
      )) as ScheduleModule
      expect(typeof loadedModule.upsertSchedules).toBe('function')
      expect(loadedModule.scheduledJobManifest).toBeDefined()
      return loadedModule
    }),
  )
}

describe('scheduled job export consumption', () => {
  it('consumes every discovered manifest in the API catalog', async () => {
    const modules = await loadScheduleModules()

    expect(new Set(SCHEDULED_JOB_MANIFESTS)).toEqual(
      new Set(modules.map(module => module.scheduledJobManifest)),
    )
  })

  it('consumes every discovered upsert function in a worker runtime definition', async () => {
    const modules = await loadScheduleModules()
    const runtimeRegistrations = await Promise.all(
      SCHEDULE_DEFINITIONS.map(definition => definition.load()),
    )

    expect(new Set(runtimeRegistrations)).toEqual(
      new Set(modules.map(module => module.upsertSchedules)),
    )
  })
})
