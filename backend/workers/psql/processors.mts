import {
  runMigrations,
  runViews,
  runConfigDriven,
  createMonthlyPartitions,
  cleanupPartitions,
  refreshMaterializedView,
} from '@data-stores/psql/migrate'
import {
  runDataRetentionCleanup,
  runMembershipOperationalCleanupPage,
} from '@services/data-retention'
import { enqueueMembershipRetentionContinuation } from '@queues/psql/enqueues'
import { dataRetentionConfig, getDataRetentionLimits } from '@services/data-retention/config'
import { reconcilePostVoteDrift } from '@services/elections-votes/shared'
import type {
  MembershipRetentionContinuationData,
  PsqlJobs,
  RefreshMaterializedViewData,
} from '@queues/psql/types'

type ProcessPsqlDependencies = {
  cleanupPartitions: typeof cleanupPartitions
  createPartitions: typeof createMonthlyPartitions
  dataRetentionCleanup: typeof runDataRetentionCleanup
  membershipRetentionCleanupPage: typeof runMembershipOperationalCleanupPage
  enqueueMembershipRetentionContinuation: typeof enqueueMembershipRetentionContinuation
  reconcileVoteDrift: typeof reconcilePostVoteDrift
  refreshMaterializedView: typeof refreshMaterializedView
  runConfigDriven: typeof runConfigDriven
  runMigrations: typeof runMigrations
  runViews: typeof runViews
}

export default async function processPsql(
  jobName: PsqlJobs,
  data?: Partial<RefreshMaterializedViewData & MembershipRetentionContinuationData>,
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
      return (dependencies?.createPartitions ?? createMonthlyPartitions)()
    case 'cleanupPartitions':
      return (dependencies?.cleanupPartitions ?? cleanupPartitions)()
    case 'dataRetentionCleanup': {
      // ast-grep-ignore: no-three-sequential-awaits -- load limits, commit cleanup, then enqueue durable continuation in order.
      await dataRetentionConfig.waitForInitialization()
      const result = await (dependencies?.dataRetentionCleanup ?? runDataRetentionCleanup)(
        getDataRetentionLimits(),
      )
      await enqueueMembershipContinuationIfNeeded(result, jobId, dependencies)
      return result
    }
    case 'continueMembershipOperationalCleanup': {
      if (
        !data ||
        typeof data.deliveredMembershipEntitlementEffects !== 'boolean' ||
        typeof data.endedMembershipRenewalNotices !== 'boolean' ||
        typeof data.terminalGooglePlayAcknowledgments !== 'boolean'
      ) {
        throw new Error('continueMembershipOperationalCleanup job requires family selection')
      }
      // ast-grep-ignore: no-three-sequential-awaits -- load limits, commit cleanup, then enqueue durable continuation in order.
      await dataRetentionConfig.waitForInitialization()
      const result = await (
        dependencies?.membershipRetentionCleanupPage ?? runMembershipOperationalCleanupPage
      )(getDataRetentionLimits(), data as MembershipRetentionContinuationData)
      await enqueueMembershipContinuationIfNeeded(result, jobId, dependencies)
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

type MembershipRetentionResult = Awaited<ReturnType<typeof runMembershipOperationalCleanupPage>>

async function enqueueMembershipContinuationIfNeeded(
  result: MembershipRetentionResult,
  jobId: string | undefined,
  dependencies?: Partial<ProcessPsqlDependencies>,
): Promise<void> {
  const next: MembershipRetentionContinuationData = {
    deliveredMembershipEntitlementEffects: result.deliveredMembershipEntitlementEffects.hasMore,
    endedMembershipRenewalNotices: result.endedMembershipRenewalNotices.hasMore,
    terminalGooglePlayAcknowledgments: result.terminalGooglePlayAcknowledgments.hasMore,
  }
  if (!Object.values(next).some(Boolean)) return
  if (!jobId) throw new Error('membership retention job requires an id for continuation')
  await (
    dependencies?.enqueueMembershipRetentionContinuation ?? enqueueMembershipRetentionContinuation
  )(jobId, next)
}
