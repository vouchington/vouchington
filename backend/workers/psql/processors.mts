import {
  runMigrations,
  runViews,
  runConfigDriven,
  createMonthlyPartitions,
  createClassifierResultRange,
  retireClassifierResultRange,
  cleanupPartitions,
  refreshMaterializedView,
} from '@data-stores/psql/migrate'
import { runDataRetentionCleanup } from '@services/data-retention'
import { createHash } from 'node:crypto'
import {
  enqueueAIRetentionContinuations,
  enqueueDataRetentionCleanupContinuation,
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
} from '@queues/psql/types'

function unfinishedClassifierSweeps(
  result: Awaited<ReturnType<typeof runDataRetentionCleanup>>['classifierRecords'],
): string[] {
  const has = (sweep: keyof typeof result) => result[sweep]?.hasMore ?? false
  const children = has('runCandidates') || has('agentTopics') || has('localOutcomes')
  const runs = has('runs') || children
  const results =
    runs || has('topicResults') || has('storyResults') || has('communityPromptResults')
  const candidates = results || has('decisionCandidates')
  const calls = candidates || has('calls')
  const batches = calls || has('batches')
  const requests = runs || has('requests')
  const identities = requests || has('deletedSubjectIdentities')
  return (
    [
      ['runCandidates', has('runCandidates')],
      ['agentTopics', has('agentTopics')],
      ['localOutcomes', has('localOutcomes')],
      ['runs', runs],
      ['topicResults', runs || has('topicResults')],
      ['storyResults', runs || has('storyResults')],
      ['communityPromptResults', runs || has('communityPromptResults')],
      ['decisionCandidates', candidates],
      ['calls', calls],
      ['batches', batches],
      ['requests', requests],
      ['deletedSubjectIdentities', identities],
      ['versionedIdentities', has('versionedIdentities')],
    ] as const
  ).flatMap(([sweep, pending]) => (pending ? [sweep] : []))
}

const MEMBERSHIP_FAMILIES = [
  'deliveredMembershipEntitlementEffects',
  'endedMembershipRenewalNotices',
  'terminalGooglePlayAcknowledgments',
] as const

function unfinishedMembershipFamilies(
  result: Awaited<ReturnType<typeof runDataRetentionCleanup>>,
): string[] {
  return MEMBERSHIP_FAMILIES.filter(family => result[family]?.hasMore)
}

type ProcessPsqlDependencies = {
  cleanupPartitions: typeof cleanupPartitions
  createPartitions: typeof createMonthlyPartitions
  dataRetentionCleanup: typeof runDataRetentionCleanup
  enqueueAIRetentionContinuations: typeof enqueueAIRetentionContinuations
  reconcileVoteDrift: typeof reconcilePostVoteDrift
  refreshMaterializedView: typeof refreshMaterializedView
  runConfigDriven: typeof runConfigDriven
  runMigrations: typeof runMigrations
  runViews: typeof runViews
}

export default async function processPsql(
  jobName: PsqlJobs,
  data?: Partial<RefreshMaterializedViewData & PsqlPartitionJobData & PsqlRetentionJobData>,
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
      return data?.classifierRange
        ? createClassifierResultRange(data.classifierRange)
        : (dependencies?.createPartitions ?? createMonthlyPartitions)()
    case 'cleanupPartitions':
      if (data?.classifierRange) {
        await dataRetentionConfig.waitForInitialization()
        return retireClassifierResultRange(data.classifierRange, getClassifierRetentionDays())
      }
      return (dependencies?.cleanupPartitions ?? cleanupPartitions)()
    case 'dataRetentionCleanup': {
      await dataRetentionConfig.waitForInitialization()
      const cleanup = dependencies?.dataRetentionCleanup ?? runDataRetentionCleanup
      const result = data?.continuation
        ? await cleanup(getDataRetentionLimits(), {
            classifierRecords: { activeSweeps: data.continuation.activeClassifierSweeps },
            activeMembershipFamilies: data.continuation.activeMembershipFamilies,
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
      if (activeClassifierSweeps.length > 0 || activeMembershipFamilies.length > 0) {
        if (!jobId) throw new Error('Data retention continuation needs the current job ID')
        const runId = data?.continuation?.runId ?? createHash('sha256').update(jobId).digest('hex')
        await enqueueDataRetentionCleanupContinuation({
          runId,
          step: (data?.continuation?.step ?? 0) + 1,
          activeClassifierSweeps,
          activeMembershipFamilies,
        })
      }
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
