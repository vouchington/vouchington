import type { JobOptions } from 'glide-mq'
import { createBulkEnqueueFunction } from '@data-stores/valkey-glide-mq'
import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import onError from '@modules/on-error'
import { AI_AGENTS_QUEUE_NAME, AI_AGENTS_DEFAULTS, AGENT_PRIORITY } from '../config.mts'
import { ai_agents } from '../queues.mts'
import type { DisputeResolutionJobData } from '../types.mts'
import { failedAiJobHasNoPendingResponses } from './failed-job-recovery.mts'

type DisputeResolutionInput = {
  disputeId: string
  requestToken: string
  rerunById?: string | null
}

function buildDisputeResolutionJob(
  disputeId: string,
  requestToken: string,
  rerunById?: string | null,
): { data: DisputeResolutionJobData; opts: JobOptions } {
  return {
    data: {
      dispute_id: disputeId,
      ai_draft_request_token: requestToken,
      rerun_by_id: rerunById ?? null,
    } satisfies DisputeResolutionJobData,
    opts: {
      // The durable request UUID survives Valkey restarts; queue-local sequence IDs do not.
      jobId: `dispute_resolution_${requestToken}`,
      attempts: AI_AGENTS_DEFAULTS.attempts,
      backoff: AI_AGENTS_DEFAULTS.backoff,
      removeOnComplete: AI_AGENTS_DEFAULTS.removeOnComplete,
      removeOnFail: false,
      priority: AGENT_PRIORITY['dispute-resolution'],
      // Skip deduplication on manual re-runs so the staff-triggered job is
      // not silently dropped by a pending automatic job.
      ...(rerunById
        ? {}
        : {
            deduplication: {
              id: `dispute_resolution_${disputeId}`,
              mode: 'simple' as const,
            },
          }),
    } satisfies JobOptions,
  }
}

const enqueueDisputeResolutionBatch = createBulkEnqueueFunction({
  queue: ai_agents,
  queueName: AI_AGENTS_QUEUE_NAME,
  jobName: 'dispute-resolution',
  buildJob: (input: DisputeResolutionInput) =>
    buildDisputeResolutionJob(input.disputeId, input.requestToken, input.rerunById),
})

function enqueueRecoverableDisputeResolution(input: DisputeResolutionInput) {
  return enqueueBulkReactivatingFinished({
    queue: ai_agents,
    inputs: [input],
    jobIdOf: item => `dispute_resolution_${item.requestToken}`,
    enqueueBulk: enqueueDisputeResolutionBatch,
    canRemoveFailed: failedAiJobHasNoPendingResponses,
  })
}

/**
 * Enqueues a dispute-resolution agent run for the given dispute.
 * Fire-and-forget — errors are swallowed via onError.
 */
export function enqueueDisputeResolution(
  disputeId: string,
  requestToken: string,
  rerunById?: string | null,
): void {
  enqueueRecoverableDisputeResolution({ disputeId, requestToken, rerunById }).catch(onError)
}

/**
 * Awaitable variant for manual staff-triggered re-runs: propagates enqueue failures so the
 * caller can surface an error instead of falsely reporting the job as queued.
 */
export async function enqueueDisputeResolutionQueued(
  disputeId: string,
  requestToken: string,
  rerunById?: string | null,
): Promise<string> {
  const [job] = await enqueueRecoverableDisputeResolution({ disputeId, requestToken, rerunById })
  if (!job) throw new Error('Dispute resolution rerun was not admitted to the queue')
  return job.id
}
