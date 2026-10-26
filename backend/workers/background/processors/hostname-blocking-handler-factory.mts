import {
  backgroundDataHandler,
  backgroundHandler,
} from '@queues/background/enqueues/define-handler'
import type {
  enqueueHostnameBlockRecovery,
  enqueueOrReactivateHostnameBlockCleanups,
} from '@queues/background/enqueues/hostname-blocking'
import {
  HOSTNAME_BLOCKING_PROCESS_JOB,
  HOSTNAME_BLOCKING_RECOVERY_JOB,
  type HostnameBlockCleanupData,
  type HostnameBlockRecoveryData,
} from '@queues/background/enqueues/hostname-blocking-jobs'
import { enqueueRecalculateVoteWeightEvents } from '@queues/vote-aggregation/enqueues/vote-weight'
import {
  getHostnameBlockCleanupOperation,
  type HostnameBlockCleanupOperation,
} from '@services/hostname-blocking/cleanup-operation'
import {
  advanceHostnameBlockPenaltyPage,
  getHostnameBlockPenaltyPage,
} from '@services/hostname-blocking/cleanup-penalties'
import { searchPendingHostnameBlockCleanups } from '@services/hostname-blocking/cleanup-recovery'
import { projectNextHostnameBlockSubdomainPage } from '@services/hostname-blocking/cleanup-subdomains'
import { softDeleteNextBlockedHostnameRelationPage } from '@services/hostname-blocking/soft-delete-relation-page'
import { getHostnameBlockingWorkLimit } from '@services/hostname-blocking/work-limits'

type HostnameBlockingEnqueues = {
  enqueueCleanups: typeof enqueueOrReactivateHostnameBlockCleanups
  enqueueRecovery: typeof enqueueHostnameBlockRecovery
}

export function createHostnameBlockingHandlers(enqueues: HostnameBlockingEnqueues) {
  async function processHostnameBlockCleanup(data: HostnameBlockCleanupData): Promise<void> {
    const operation = await getHostnameBlockCleanupOperation(data.blockId)
    if (!operation || operation.completedAt) return
    if (operation.progress !== data.progress) return enqueueContinuation(operation)

    const cursor = data.cursor ?? { stage: 'subdomains' }
    if (cursor.stage === 'subdomains') {
      const projection = await projectNextHostnameBlockSubdomainPage(
        data.blockId,
        data.progress,
        cursor.afterReversedHostname,
        getHostnameBlockingWorkLimit('hostname_scan_batch_size'),
      )
      if (projection.operation && !projection.operation.completedAt) {
        await enqueueContinuation(projection.operation, projection.cursor)
      }
      return
    }

    if (cursor.stage === 'relations') {
      const relationPage = await softDeleteNextBlockedHostnameRelationPage(
        data.blockId,
        data.progress,
        cursor,
        {
          hostname: getHostnameBlockingWorkLimit('hostname_scan_batch_size'),
          url: getHostnameBlockingWorkLimit('url_scan_batch_size'),
          relation: getHostnameBlockingWorkLimit('relation_delete_batch_size'),
        },
      )
      if (relationPage.operation && !relationPage.operation.completedAt) {
        await enqueueContinuation(relationPage.operation, relationPage.cursor)
      }
      return
    }

    const { updated, userIds } = await processHostnameBlockPenaltyPage(
      operation,
      cursor.afterUserId,
    )
    if (updated && !updated.completedAt) {
      await enqueueContinuation(updated, {
        stage: 'penalties',
        afterUserId: userIds.at(-1)!,
      })
    }
  }

  async function processHostnameBlockPenaltyPage(
    operation: HostnameBlockCleanupOperation,
    afterUserId: string | undefined,
  ): Promise<{ updated: HostnameBlockCleanupOperation | null; userIds: string[] }> {
    const penaltyLimit = getHostnameBlockingWorkLimit('penalty_enqueue_batch_size')
    const userIds = await getHostnameBlockPenaltyPage(operation, afterUserId, penaltyLimit)
    await enqueueRecalculateVoteWeightEvents(
      userIds.map(userId => ({
        userId,
        jobId: `voteWeight__${userId}__force`,
        forceRecalculate: true,
      })),
    )
    // ast-grep-ignore: no-three-sequential-awaits -- durable progress advances only after the bounded read and stable enqueue admission succeed.
    const updated = await advanceHostnameBlockPenaltyPage(
      operation.blockId,
      operation.progress,
      userIds.length < penaltyLimit,
    )
    return { updated, userIds }
  }

  async function recoverHostnameBlockCleanups(data: HostnameBlockRecoveryData): Promise<void> {
    const limit = getHostnameBlockingWorkLimit('recovery_batch_size')
    const operations = await searchPendingHostnameBlockCleanups(data.afterBlockId, limit)
    await enqueues.enqueueCleanups(operations)
    if (operations.length === limit) {
      await enqueues.enqueueRecovery({ afterBlockId: operations.at(-1)!.blockId })
    }
  }

  async function enqueueContinuation(
    operation: HostnameBlockCleanupOperation,
    cursor?: HostnameBlockCleanupData['cursor'],
  ): Promise<void> {
    await enqueues.enqueueCleanups([
      {
        blockId: operation.blockId,
        progress: operation.progress,
        ...(cursor ? { cursor } : {}),
      },
    ])
  }

  return [
    backgroundDataHandler(HOSTNAME_BLOCKING_PROCESS_JOB, processHostnameBlockCleanup),
    backgroundHandler(HOSTNAME_BLOCKING_RECOVERY_JOB, job =>
      recoverHostnameBlockCleanups(job.data ?? {}),
    ),
  ]
}
