import type {
  ScheduledJobDefinition as SharedScheduledJobDefinition,
  ScheduledJobManifest as SharedScheduledJobManifest,
} from '@vouchington/worker-runtime/schedule-manifest'

export type ScheduledJobEnvironment = 'all' | 'production' | 'deployed'

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

export type ScheduledJobDefinition =
  SharedScheduledJobDefinition<ScheduledJobOperatorSurfaceDefinition> & {
    environment?: ScheduledJobEnvironment
  }

export type ScheduledJobManifest = SharedScheduledJobManifest<ScheduledJobDefinition>

export type ProjectedScheduledJob = {
  id: string
  queue_name: string
  job_name: string
  schedule: string
  description: string
  trigger: ScheduledJobTrigger
}
