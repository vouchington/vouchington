import {
  processMonthlyPartitionCleanup,
  type PartitionCleanupDependencies,
} from './processors/partition-cleanup.mts'
import {
  runMigrations,
  runViews,
  runConfigDriven,
  createMonthlyPartitions,
  createClassifierResultRange,
  retireClassifierResultRange,
  createUserDataRequestRange,
  retireUserDataRequestRange,
  refreshMaterializedView,
} from '@data-stores/psql/migrate'
import {
  runDataRetentionCleanup,
  runVoteRetentionCleanupPage,
  type VoteRetentionCleanupOptions,
  type AgentModerationRetentionOptions,
  type DataRetentionCleanupOptions,
} from '@services/data-retention'
import { admitDataRetentionContinuations } from './processors/data-retention-continuation.mts'
import {
  enqueueVoteRetentionContinuationIfNeeded,
  requireVoteRetentionSelection,
} from './processors/vote-retention.mts'
import {
  processAgentModerationRetentionContinuation,
  startAgentModerationRetentionContinuation,
} from './processors/agent-moderation-retention.mts'
import { enqueueAIRetentionContinuations } from '@queues/psql/enqueues'
import {
  dataRetentionConfig,
  getClassifierRetentionDays,
  getDataRetentionLimits,
} from '@services/data-retention/config'
import { reconcilePostVoteDrift } from '@services/elections-votes/shared'
import {
  AI_RETENTION_FAMILIES,
  type PsqlJobs,
  type AgentModerationRetentionContinuationData,
  type PsqlPartitionJobData,
  type PsqlRetentionJobData,
  type RefreshMaterializedViewData,
  type VoteRetentionContinuationData,
} from '@queues/psql/types'
import {
  processCopyrightRetentionContinuation,
  type CopyrightRetentionScope,
} from './processors/copyright-retention.mts'

type ProcessPsqlDependencies = PartitionCleanupDependencies & {
  createPartitions: typeof createMonthlyPartitions
  refreshMaterializedView: typeof refreshMaterializedView
  runConfigDriven: typeof runConfigDriven
  runMigrations: typeof runMigrations
  runViews: typeof runViews
}

export default async function processPsql(
  jobName: PsqlJobs,
  data?: Partial<
    RefreshMaterializedViewData &
      PsqlPartitionJobData &
      PsqlRetentionJobData &
      AgentModerationRetentionContinuationData &
      VoteRetentionContinuationData
  >,
  dependencies?: Partial<ProcessPsqlDependencies>,
  jobId?: string,
  options?: {
    vote?: VoteRetentionCleanupOptions
    agentModeration?: AgentModerationRetentionOptions
    copyright?: CopyrightRetentionScope
    retention?: DataRetentionCleanupOptions
  },
) {
  switch (jobName) {
    case 'runMigrations':
      return (dependencies?.runMigrations ?? runMigrations)()
    case 'runViews':
      return (dependencies?.runViews ?? runViews)()
    case 'runConfigDriven':
      return (dependencies?.runConfigDriven ?? runConfigDriven)()
    case 'createPartitions':
      if (data?.classifierRange) return createClassifierResultRange(data.classifierRange)
      if (data?.requestRange) return createUserDataRequestRange(data.requestRange)
      return (dependencies?.createPartitions ?? createMonthlyPartitions)()
    case 'cleanupPartitions': {
      if (data?.classifierRange) {
        await dataRetentionConfig.waitForInitialization()
        return retireClassifierResultRange(data.classifierRange, getClassifierRetentionDays())
      }
      if (data?.requestRange) return retireUserDataRequestRange(data.requestRange)
      return processMonthlyPartitionCleanup(data?.partitionContinuation, dependencies, jobId)
    }
    case 'dataRetentionCleanup': {
      await dataRetentionConfig.waitForInitialization()
      const copyrightFamilies = data?.continuation?.copyrightFamilies
      if (copyrightFamilies) {
        return processCopyrightRetentionContinuation(data!.continuation!, options?.copyright)
      }
      const result = data?.continuation
        ? await runDataRetentionCleanup(getDataRetentionLimits(), {
            ...options?.retention,
            activeCopyrightFamilies: [],
            classifierRecords: {
              ...options?.retention?.classifierRecords,
              activeSweeps:
                options?.retention?.classifierRecords?.activeSweeps === undefined
                  ? data.continuation.activeClassifierSweeps
                  : data.continuation.activeClassifierSweeps.filter(sweep =>
                      options.retention?.classifierRecords?.activeSweeps?.includes(sweep),
                    ),
            },
            activeMembershipFamilies: data.continuation.activeMembershipFamilies,
            postModerationLedger: {
              ...options?.retention?.postModerationLedger,
              kinds: data.continuation.activePostModerationKinds,
            },
            includeAgentModerations: false,
            ...(data.continuation.userPurge
              ? {
                  softDeletedUsers: {
                    ...options?.retention?.softDeletedUsers,
                    userPurge: data.continuation.userPurge,
                  },
                }
              : {}),
            aiUsageRecords: {
              ...options?.retention?.aiUsageRecords,
              active: data.continuation.activeAiUsage ?? false,
            },
          })
        : await runDataRetentionCleanup(getDataRetentionLimits(), options?.retention)
      const aiFamilies = AI_RETENTION_FAMILIES.filter(family => result[family].hasMore)
      if (aiFamilies.length > 0) {
        await enqueueAIRetentionContinuations(aiFamilies)
      }
      await admitDataRetentionContinuations(result, data?.continuation, jobId)
      await startAgentModerationRetentionContinuation(result.agentModerations.continuation, jobId)
      // Cleanup continuations rerun the same bounded families, so only the first run chains vote pages.
      if (!data?.continuation) {
        await enqueueVoteRetentionContinuationIfNeeded(result, jobId)
      }
      return result
    }
    case 'continueAgentModerationRetentionCleanup':
      return processAgentModerationRetentionContinuation(data, options?.agentModeration)
    case 'continueVoteRetentionCleanup': {
      const selection = requireVoteRetentionSelection(data)
      // ast-grep-ignore: no-three-sequential-awaits -- initialization publishes batch_size and max_batches_per_run read by getDataRetentionLimits; the bounded page result supplies the continuation cursor
      await dataRetentionConfig.waitForInitialization()
      const result = await runVoteRetentionCleanupPage(
        getDataRetentionLimits(),
        selection,
        options?.vote,
      )
      await enqueueVoteRetentionContinuationIfNeeded(result, jobId)
      return result
    }
    case 'refreshMaterializedView': {
      if (!data?.viewName) {
        throw new Error('refreshMaterializedView job requires data.viewName')
      }
      return (dependencies?.refreshMaterializedView ?? refreshMaterializedView)(data.viewName)
    }
    case 'reconcileVoteDrift':
      return reconcilePostVoteDrift()
    default:
      throw new Error(`Unknown job: ${jobName}`)
  }
}
