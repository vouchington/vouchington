import { toSchedulerTemplateOptions } from '@modules/scheduled-job-manifest'
import { MEMBERSHIPS_RECOVER_MICROSOFT_STORE_SOURCES_JOB } from '@queues/background/enqueues/memberships-jobs'
import { MICROSOFT_STORE_SOURCE_RECOVERY_INTERVAL_MS } from '../config.mts'
import {
  enqueueRecoverMicrosoftStoreSources,
  microsoftStoreRecoveryOrdering,
} from './microsoft-store.mts'

export const microsoftStoreSchedules = [
  {
    schedulerId: 'microsoftStoreSourceRecovery',
    repeat: { every: MICROSOFT_STORE_SOURCE_RECOVERY_INTERVAL_MS },
    template: {
      name: MEMBERSHIPS_RECOVER_MICROSOFT_STORE_SOURCES_JOB.name,
      data: {},
      opts: toSchedulerTemplateOptions({
        ...MEMBERSHIPS_RECOVER_MICROSOFT_STORE_SOURCES_JOB.options,
        ordering: microsoftStoreRecoveryOrdering,
      }),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'microsoftStoreSourceRecovery',
        schedule: 'every 1h',
        description: 'Recheck known Microsoft Store sources with usable credentials',
        trigger: enqueueRecoverMicrosoftStoreSources,
      },
    ],
  },
] as const
