import { globSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import type { ScheduledJobManifest } from '../backend/modules/scheduled-job-manifest/types.mts'
import { SCHEDULE_DEFINITIONS } from '../backend/entrypoints/worker-cpu/schedule-definitions.mts'
import { BACKGROUND_CPU_QUEUE_NAME } from '../backend/queues/background-cpu/config.mts'
import { BACKGROUND_QUEUE_NAME } from '../backend/queues/background/config.mts'
import { SCHEDULED_JOB_MANIFESTS } from '../backend/services/queue-monitoring/scheduled-job-manifests.mts'

// Shipped schedule catalog for the static backend gate. Not a Vitest root.
// Shared-queue domains contribute manifests to one combined registration, so they have no
// `upsertSchedules` of their own: registering a domain's manifest alone would prune the others.
const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const combinedQueues: readonly string[] = [BACKGROUND_QUEUE_NAME, BACKGROUND_CPU_QUEUE_NAME]
const schedulePaths = [
  ...globSync('backend/queues/*/enqueues/schedules.mts', { cwd: repoRoot }).filter(
    path =>
      !path.startsWith('backend/queues/background/') &&
      !path.startsWith('backend/queues/background-cpu/'),
  ),
  ...globSync('backend/queues/{background,background-cpu}/enqueues/*-schedules.mts', {
    cwd: repoRoot,
  }),
].toSorted()

const failures = await scheduleCatalogFailures()
if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}
process.exit(0)

type ScheduleModule = {
  scheduledJobManifest?: ScheduledJobManifest
  upsertSchedules?: () => Promise<void>
}

async function scheduleCatalogFailures(): Promise<string[]> {
  const failures: string[] = []
  if (schedulePaths.length === 0) {
    return ['no schedule modules matched the schedule globs']
  }

  const modules = await Promise.all(
    schedulePaths.map(async path => {
      const loadedModule = (await import(
        pathToFileURL(join(repoRoot, path)).href
      )) as ScheduleModule
      const manifest = loadedModule.scheduledJobManifest
      if (manifest === undefined) {
        failures.push(`${path}: missing scheduledJobManifest`)
      }
      const combinedQueue = manifest !== undefined && combinedQueues.includes(manifest.queueName)
      const upsertKind = typeof loadedModule.upsertSchedules
      const expectedUpsert = combinedQueue ? 'undefined' : 'function'
      if (manifest !== undefined && upsertKind !== expectedUpsert) {
        failures.push(`${path}: upsertSchedules is ${upsertKind}, expected ${expectedUpsert}`)
      }
      return loadedModule
    }),
  )

  const own = modules.filter(loadedModule => {
    const queueName = loadedModule.scheduledJobManifest?.queueName
    return queueName !== undefined && !combinedQueues.includes(queueName)
  })
  const combined = SCHEDULED_JOB_MANIFESTS.filter(manifest =>
    combinedQueues.includes(manifest.queueName),
  )
  const catalogOwn = SCHEDULED_JOB_MANIFESTS.filter(manifest => !combined.includes(manifest))
  const moduleOwn = own.flatMap(loadedModule =>
    loadedModule.scheduledJobManifest === undefined ? [] : [loadedModule.scheduledJobManifest],
  )
  const moduleOwnSet = new Set(moduleOwn)
  const catalogOwnSet = new Set(catalogOwn)
  const onlyCatalog = catalogOwn.filter(manifest => !moduleOwnSet.has(manifest))
  const onlyModules = moduleOwn.filter(manifest => !catalogOwnSet.has(manifest))
  if (onlyCatalog.length > 0 || onlyModules.length > 0) {
    failures.push(
      [
        'API catalog manifests are not the discovered own-queue manifests',
        `only in catalog: ${onlyCatalog.map(describeManifest).join('; ') || '(none)'}`,
        `only in modules: ${onlyModules.map(describeManifest).join('; ') || '(none)'}`,
      ].join('\n'),
    )
  }
  if (combined.length !== combinedQueues.length) {
    failures.push(
      `catalog combined manifests: ${combined.length}, expected ${combinedQueues.length} (${combined.map(manifest => manifest.queueName).join(', ')})`,
    )
  }
  const domainSchedulerIds = new Map<string, string[]>(
    combinedQueues.map(queueName => [queueName, []]),
  )
  for (const loadedModule of modules) {
    const manifest = loadedModule.scheduledJobManifest
    const ids = manifest === undefined ? undefined : domainSchedulerIds.get(manifest.queueName)
    if (manifest === undefined || ids === undefined) continue
    for (const job of manifest.jobs) ids.push(job.schedulerId)
  }
  const catalogIdsByQueue = new Map(
    combined.map(manifest => [
      manifest.queueName,
      manifest.jobs.map(job => job.schedulerId).toSorted(),
    ]),
  )
  for (const queueName of combinedQueues) {
    const discoveredIds = (domainSchedulerIds.get(queueName) ?? []).toSorted()
    const catalogIds = catalogIdsByQueue.get(queueName) ?? []
    if (!sameList(discoveredIds, catalogIds)) {
      failures.push(
        `${queueName}: catalog scheduler ids [${catalogIds.join(', ')}] do not match discovered modules [${discoveredIds.join(', ')}]`,
      )
    }
  }

  const runtimeRegistrations = await Promise.all(
    SCHEDULE_DEFINITIONS.map(definition => definition.load()),
  )
  const ownRegistrations = modules.flatMap(loadedModule =>
    loadedModule.upsertSchedules === undefined ? [] : [loadedModule.upsertSchedules],
  )
  const combinedRegistrations = runtimeRegistrations.filter(
    register => !ownRegistrations.includes(register),
  )
  if (combinedRegistrations.length !== 2) {
    failures.push(
      `worker runtime combined registrations: ${combinedRegistrations.length}, expected 2`,
    )
  }
  const combinedQueueNames = SCHEDULE_DEFINITIONS.flatMap((definition, index) => {
    const registration = runtimeRegistrations[index]
    return registration !== undefined && combinedRegistrations.includes(registration)
      ? [definition.queueName]
      : []
  }).toSorted()
  const expectedQueueNames = [BACKGROUND_CPU_QUEUE_NAME, BACKGROUND_QUEUE_NAME].toSorted()
  if (!sameList(combinedQueueNames, expectedQueueNames)) {
    failures.push(
      `worker runtime combined queues [${combinedQueueNames.join(', ')}] do not match [${expectedQueueNames.join(', ')}]`,
    )
  }
  const runtimeSet = new Set(runtimeRegistrations)
  const expectedRegistrations = new Set([...ownRegistrations, ...combinedRegistrations])
  if (
    runtimeSet.size !== expectedRegistrations.size ||
    [...runtimeSet].some(registration => !expectedRegistrations.has(registration))
  ) {
    failures.push(
      'worker runtime schedule functions are not the discovered upsert functions plus the combined registrations',
    )
  }
  return failures
}

function describeManifest(manifest: ScheduledJobManifest): string {
  const ids = manifest.jobs
    .map(job => job.schedulerId)
    .toSorted()
    .join(', ')
  return `${manifest.queueName} [${ids}]`
}

function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}
