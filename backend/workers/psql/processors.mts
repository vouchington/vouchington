import {
  runMigrations,
  runViews,
  runConfigDriven,
  createMonthlyPartitions,
  cleanupPartitions,
  refreshMaterializedView,
} from '@data-stores/psql/migrate'
import { runDataRetentionCleanup } from '@services/data-retention'
import { reconcilePostVoteDrift } from '@services/elections-votes/shared'
import type { PsqlJobs, RefreshMaterializedViewData } from '@queues/psql/types'

type ProcessPsqlDependencies = {
  cleanupPartitions: typeof cleanupPartitions
  createPartitions: typeof createMonthlyPartitions
  dataRetentionCleanup: typeof runDataRetentionCleanup
  reconcileVoteDrift: typeof reconcilePostVoteDrift
  refreshMaterializedView: typeof refreshMaterializedView
  runConfigDriven: typeof runConfigDriven
  runMigrations: typeof runMigrations
  runViews: typeof runViews
}

export default async function processPsql(
  jobName: PsqlJobs,
  data?: Partial<RefreshMaterializedViewData>,
  dependencies?: Partial<ProcessPsqlDependencies>,
) {
  switch (jobName) {
    case 'runMigrations':
      return (dependencies?.runMigrations ?? runMigrations)()
    case 'runViews':
      return (dependencies?.runViews ?? runViews)()
    case 'runConfigDriven':
      return (dependencies?.runConfigDriven ?? runConfigDriven)()
    case 'createPartitions':
      return (dependencies?.createPartitions ?? createMonthlyPartitions)()
    case 'cleanupPartitions':
      return (dependencies?.cleanupPartitions ?? cleanupPartitions)()
    case 'dataRetentionCleanup':
      return (dependencies?.dataRetentionCleanup ?? runDataRetentionCleanup)()
    case 'refreshMaterializedView': {
      if (!data?.viewName) {
        throw new Error('refreshMaterializedView job requires data.viewName')
      }
      return (dependencies?.refreshMaterializedView ?? refreshMaterializedView)(data.viewName)
    }
    case 'reconcileVoteDrift':
      return (dependencies?.reconcileVoteDrift ?? reconcilePostVoteDrift)()
    default:
      throw new Error(`Unknown job: ${jobName}`)
  }
}
