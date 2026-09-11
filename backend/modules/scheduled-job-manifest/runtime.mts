import {
  getDeployEnvironment,
  isProductionEnvironment,
  type DeployEnvironmentSource,
} from '@ts-shared/deploy-environment'
import { clampScheduledJobRepeatToHourlyFloor } from './hourly-clamp.mts'
import type {
  ScheduledJobManifest,
  ScheduledJobQueue,
  ScheduledJobRuntimeOptions,
} from './types.mts'
import { validateStagingHourlyFloorBypass } from './staging-hourly-floor-validation.mts'
import { validateScheduledJobRepeat } from './validation.mts'

export async function upsertScheduledJobManifest(
  queue: ScheduledJobQueue,
  manifest: ScheduledJobManifest,
  // `env` and `applyHourlyFloor` are runtime.mts-local extensions (not part of the shared
  // ScheduledJobRuntimeOptions type): `env` lets tests pin ENVIRONMENT/NODE_ENV per call instead
  // of mutating the ambient process.env, which leaks across parallel Vitest files;
  // `applyHourlyFloor` lets tests drive the floor directly. The real default -- staging only, via
  // the deploy-environment accessor -- is derived from `env` below.
  options: ScheduledJobRuntimeOptions & {
    env?: DeployEnvironmentSource
    applyHourlyFloor?: boolean
  } = {},
): Promise<void> {
  // IS_PRODUCTION (not raw NODE_ENV, which ECS also sets to 'production' on staging):
  // options.nodeEnv remains a full override for tests; the real runtime path defers to
  // ENVIRONMENT via isProductionEnvironment() so 'production'-only jobs stay off staging.
  const isProduction =
    options.nodeEnv === undefined
      ? isProductionEnvironment(options.env)
      : options.nodeEnv === 'production'
  const jobs = manifest.jobs.filter(job => job.environment !== 'production' || isProduction)
  const applyHourlyFloor =
    options.applyHourlyFloor ?? getDeployEnvironment(options.env) === 'staging'
  await registerJobs(queue, jobs, applyHourlyFloor)
  await removeExtraSchedulers(queue, jobs)
}

async function registerJobs(
  queue: ScheduledJobQueue,
  jobs: ScheduledJobManifest['jobs'],
  applyHourlyFloor: boolean,
): Promise<void> {
  const batches: { parallel: boolean; jobs: ScheduledJobManifest['jobs'][number][] }[] = []
  for (const job of jobs) {
    if (job.registration === 'sequential') {
      batches.push({ parallel: false, jobs: [job] })
    } else {
      const batch = batches.at(-1)
      if (batch?.parallel) batch.jobs.push(job)
      else batches.push({ parallel: true, jobs: [job] })
    }
  }
  await batches.reduce<Promise<void>>(
    (completion, batch) => completion.then(() => registerBatch(queue, batch, applyHourlyFloor)),
    Promise.resolve(),
  )
}

function registerBatch(
  queue: ScheduledJobQueue,
  batch: { parallel: boolean; jobs: ScheduledJobManifest['jobs'][number][] },
  applyHourlyFloor: boolean,
): Promise<void> {
  const registrations = batch.jobs.map(job =>
    Promise.resolve().then(() => register(queue, job, applyHourlyFloor)),
  )
  return batch.parallel
    ? Promise.all(registrations).then(() => undefined)
    : registrations[0]!.then(() => undefined)
}

function register(
  queue: ScheduledJobQueue,
  job: ScheduledJobManifest['jobs'][number],
  applyHourlyFloor: boolean,
): Promise<unknown> {
  const resolvedRepeat = resolve(job.repeat)
  validateScheduledJobRepeat(resolvedRepeat, `${job.schedulerId}`, job.subMinuteJustification)
  validateStagingHourlyFloorBypass(job, resolvedRepeat, job.schedulerId)
  // The floor clamps the resolved value, not the definition: a thunk must re-resolve to its
  // real interval on every call, and only the interval actually about to be registered matters.
  // `environment: 'production'` jobs (e.g. psql's dataRetentionCleanup) are excluded here too,
  // even though the upstream filter above already excludes them whenever applyHourlyFloor would
  // correctly be true (on staging): this is intentional defense-in-depth. It decouples "a
  // production-flagged job is never clamped" from correct derivation of applyHourlyFloor by the
  // caller -- the two booleans are computed independently and aren't causally linked.
  const repeat =
    applyHourlyFloor && job.environment !== 'production' && job.stagingHourlyFloor === undefined
      ? clampScheduledJobRepeatToHourlyFloor(resolvedRepeat).repeat
      : resolvedRepeat
  const data =
    job.template.dataFactory === undefined ? job.template.data : job.template.dataFactory()
  const template = {
    name: job.template.name,
    opts: resolve(job.template.opts),
    ...(data === undefined ? {} : { data }),
  }
  return queue.upsertJobScheduler(job.schedulerId, repeat, template)
}

async function removeExtraSchedulers(
  queue: ScheduledJobQueue,
  jobs: ScheduledJobManifest['jobs'],
): Promise<void> {
  const desired = new Set(jobs.map(job => job.schedulerId))
  const existing = await queue.getRepeatableJobs()
  const extras: string[] = []
  for (const entry of existing) {
    if (!desired.has(entry.name)) extras.push(entry.name)
  }
  await Promise.all(extras.map(name => queue.removeJobScheduler(name)))
}

function resolve<T>(value: T | (() => T)): T
function resolve<T>(value: T | (() => T) | undefined): T | undefined
function resolve<T>(value: T | (() => T) | undefined): T | undefined {
  return typeof value === 'function' ? (value as () => T)() : value
}
