import type { JobOptions } from 'glide-mq'

export type ScheduledJobEnvironment = 'all' | 'production'

export type ScheduledJobRepeat = { pattern: string } | { every: number }

type ScheduledJobRepeatDefinition = ScheduledJobRepeat | (() => ScheduledJobRepeat)

export type ScheduledJobTrigger = () => unknown | Promise<unknown>

export type ScheduledJobOperatorSurface = {
  kind: 'scheduled-jobs'
  id: string
  schedule: string
  description: string
  trigger: ScheduledJobTrigger
}

export type BackfillOperatorSurface = {
  kind: 'backfill'
  backfillId: string
}

export type PsqlAdminOperatorSurface = {
  kind: 'psql'
  jobType: string
}

export type ValkeyBloomOperatorSurface = {
  kind: 'valkey-bloom-filter'
  rebuildInput: string
}

export type ScheduledJobOperatorSurfaceDefinition =
  | ScheduledJobOperatorSurface
  | BackfillOperatorSurface
  | PsqlAdminOperatorSurface
  | ValkeyBloomOperatorSurface

export type NonEmptyOperatorSurfaces = readonly [
  ScheduledJobOperatorSurfaceDefinition,
  ...ScheduledJobOperatorSurfaceDefinition[],
]

type ScheduledJobTemplate = {
  name: string
  opts: JobOptions | (() => JobOptions)
} & ({ data?: unknown; dataFactory?: never } | { data?: never; dataFactory: () => unknown })

export type ScheduledJobDefinition = {
  schedulerId: string
  repeat: ScheduledJobRepeatDefinition
  template: ScheduledJobTemplate
  environment?: ScheduledJobEnvironment
  registration?: 'sequential'
  operatorSurfaces: NonEmptyOperatorSurfaces
  /**
   * Required whenever the resolved `repeat` cadence is faster than the global 1-minute scheduling
   * floor. Optional in the type because the requirement depends on a resolved (possibly
   * thunk-computed) value that TypeScript cannot see; it is enforced at runtime by
   * `validateScheduledJobRepeat` in `./validation.mts`, which throws a manifest-validation error
   * when a sub-minute cadence has no justification. No job is justified today.
   */
  subMinuteJustification?: string
  stagingHourlyFloor?: {
    bypassJustification: string
  }
}

export type ScheduledJobManifest = {
  queueName: string
  jobs: readonly ScheduledJobDefinition[]
}

export type ScheduledJobQueue = {
  upsertJobScheduler: (
    schedulerId: string,
    repeat: ScheduledJobRepeat,
    template: { name: string; data?: unknown; opts: JobOptions },
  ) => Promise<unknown>
  getRepeatableJobs: () => Promise<ReadonlyArray<{ name: string }>>
  removeJobScheduler: (schedulerId: string) => Promise<unknown>
}

export type ScheduledJobRuntimeOptions = {
  nodeEnv?: string
}

export type ProjectedScheduledJob = {
  id: string
  queue_name: string
  job_name: string
  schedule: string
  description: string
  trigger: ScheduledJobTrigger
}
