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
      return await (dependencies?.runMigrations ?? runMigrations)()
    case 'runViews':
      return await (dependencies?.runViews ?? runViews)()
    case 'runConfigDriven':
      return await (dependencies?.runConfigDriven ?? runConfigDriven)()
    case 'createPartitions':
      return await (dependencies?.createPartitions ?? createMonthlyPartitions)()
    case 'cleanupPartitions':
      return await (dependencies?.cleanupPartitions ?? cleanupPartitions)()
    case 'dataRetentionCleanup':
      return await (dependencies?.dataRetentionCleanup ?? runDataRetentionCleanup)()
    case 'refreshMaterializedView': {
      if (!data?.viewName) {
        throw new Error('refreshMaterializedView job requires data.viewName')
      }
      return await (dependencies?.refreshMaterializedView ?? refreshMaterializedView)(data.viewName)
    }
    case 'reconcileVoteDrift':
      return await (dependencies?.reconcileVoteDrift ?? reconcilePostVoteDrift)()
    default:
      throw new Error(`Unknown job: ${jobName}`)
  }
}
