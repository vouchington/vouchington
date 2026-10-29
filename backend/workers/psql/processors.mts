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
  runCopyrightOperationalRetentionCleanup,
  runDataRetentionCleanup,
  runVoteRetentionCleanupPage,
} from '@services/data-retention'
import {
  unfinishedClassifierSweeps,
  unfinishedMembershipFamilies,
} from './processors/retention-sweeps.mts'
import {
  enqueueVoteRetentionContinuationIfNeeded,
  requireVoteRetentionSelection,
} from './processors/vote-retention.mts'
import { createHash } from 'node:crypto'
import {
  enqueueAIRetentionContinuations,
  enqueueDataRetentionCleanupContinuation,
  enqueueDataRetentionContinuation,
} from '@queues/psql/enqueues'
import {
  dataRetentionConfig,
  getClassifierRetentionDays,
  getDataRetentionLimits,
} from '@services/data-retention/config'
import { reconcilePostVoteDrift } from '@services/elections-votes/shared'
import {
  AI_RETENTION_FAMILIES,
  type PsqlJobs,
  type PsqlPartitionJobData,
  type PsqlRetentionJobData,
  type RefreshMaterializedViewData,
  type VoteRetentionContinuationData,
} from '@queues/psql/types'
import {
  processCopyrightRetentionContinuation,
  unfinishedCopyrightFamilies,
} from './processors/copyright-retention.mts'

type ProcessPsqlDependencies = PartitionCleanupDependencies & {
  createPartitions: typeof createMonthlyPartitions
  dataRetentionCleanup: typeof runDataRetentionCleanup
  copyrightRetentionCleanup: typeof runCopyrightOperationalRetentionCleanup
  enqueueDataRetentionCleanupContinuation: typeof enqueueDataRetentionCleanupContinuation
  enqueueAIRetentionContinuations: typeof enqueueAIRetentionContinuations
  voteRetentionCleanupPage: typeof runVoteRetentionCleanupPage
  enqueueDataRetentionContinuation: typeof enqueueDataRetentionContinuation
  reconcileVoteDrift: typeof reconcilePostVoteDrift
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
      VoteRetentionContinuationData
  >,
  dependencies?: Partial<ProcessPsqlDependencies>,
  jobId?: string,
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
      // ast-grep-ignore: no-three-sequential-awaits -- load limits, commit cleanup, then enqueue its durable continuation in order.
      await dataRetentionConfig.waitForInitialization()
      const copyrightFamilies = data?.continuation?.copyrightFamilies
      if (copyrightFamilies) {
        return processCopyrightRetentionContinuation(data!.continuation!, {
          cleanup: dependencies?.copyrightRetentionCleanup,
          enqueue: dependencies?.enqueueDataRetentionCleanupContinuation,
        })
      }
      const cleanup = dependencies?.dataRetentionCleanup ?? runDataRetentionCleanup
      const result = data?.continuation
        ? await cleanup(getDataRetentionLimits(), {
            activeCopyrightFamilies: [],
            classifierRecords: { activeSweeps: data.continuation.activeClassifierSweeps },
            activeMembershipFamilies: data.continuation.activeMembershipFamilies,
            ...(data.continuation.userPurge
              ? { softDeletedUsers: { userPurge: data.continuation.userPurge } }
              : {}),
          })
        : await cleanup(getDataRetentionLimits())
      const aiFamilies = AI_RETENTION_FAMILIES.filter(family => result[family].hasMore)
      if (aiFamilies.length > 0) {
        await (dependencies?.enqueueAIRetentionContinuations ?? enqueueAIRetentionContinuations)(
          aiFamilies,
        )
      }
      const activeClassifierSweeps = unfinishedClassifierSweeps(result.classifierRecords)
      const activeMembershipFamilies = unfinishedMembershipFamilies(result)
      const activeCopyrightFamilies = unfinishedCopyrightFamilies(result)
      const userPurge = result.softDeletedUsers.hasMore
        ? result.softDeletedUsers.userPurge
        : undefined
      if (!data?.continuation && activeCopyrightFamilies.length > 0) {
        if (!jobId) throw new Error('Copyright retention continuation needs the current job ID')
        const runId = createHash('sha256').update(jobId).digest('hex')
        await (
          dependencies?.enqueueDataRetentionCleanupContinuation ??
          enqueueDataRetentionCleanupContinuation
        )({
          runId,
          step: 1,
          activeClassifierSweeps: [],
          activeMembershipFamilies: [],
          copyrightFamilies: activeCopyrightFamilies,
        })
      }
      if (
        activeClassifierSweeps.length > 0 ||
        activeMembershipFamilies.length > 0 ||
        result.softDeletedUsers.hasMore
      ) {
        if (!jobId) throw new Error('Data retention continuation needs the current job ID')
        const runId = data?.continuation?.runId ?? createHash('sha256').update(jobId).digest('hex')
        await (
          dependencies?.enqueueDataRetentionCleanupContinuation ??
          enqueueDataRetentionCleanupContinuation
        )({
          runId,
          step: (data?.continuation?.step ?? 0) + 1,
          activeClassifierSweeps,
          activeMembershipFamilies,
          ...(userPurge ? { userPurge } : {}),
        })
      }
      // Cleanup continuations rerun the same bounded families, so only the first run chains vote pages.
      if (!data?.continuation) {
        await enqueueVoteRetentionContinuationIfNeeded(
          result,
          jobId,
          dependencies?.enqueueDataRetentionContinuation,
        )
      }
      return result
    }
    case 'continueVoteRetentionCleanup': {
      const selection = requireVoteRetentionSelection(data)
      // ast-grep-ignore: no-three-sequential-awaits -- load limits, commit cleanup, then enqueue its durable continuation in order.
      await dataRetentionConfig.waitForInitialization()
      const result = await (dependencies?.voteRetentionCleanupPage ?? runVoteRetentionCleanupPage)(
        getDataRetentionLimits(),
        selection,
      )
      await enqueueVoteRetentionContinuationIfNeeded(
        result,
        jobId,
        dependencies?.enqueueDataRetentionContinuation,
      )
      return result
    }
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
