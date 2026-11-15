import type { JobOptions } from 'glide-mq'
import onError from '@modules/on-error'
import { trackJobEnqueue } from '@services/analytics'
import { AI_AGENTS_QUEUE_NAME, AI_AGENTS_DEFAULTS, AGENT_PRIORITY } from '../config.mts'
import type { DisputeResolutionJobData } from '../types.mts'
import { addAIAgentJob } from './create-enqueue.mts'

export function disputeResolutionJobId(runId: string): string {
  return `dispute_resolution_${runId}`
}

function buildDisputeResolutionJob(
  disputeId: string,
  runId: string,
  rerunById?: string | null,
): { data: DisputeResolutionJobData; opts: JobOptions } {
  return {
    data: {
      dispute_id: disputeId,
      run_id: runId,
      rerun_by_id: rerunById ?? null,
    } satisfies DisputeResolutionJobData,
    opts: {
      // The durable run UUID survives Valkey restarts; queue-local sequence IDs do not. Enqueueing
      // the same admitted run again is therefore a no-op, which lets admission retries heal a lost job.
      jobId: disputeResolutionJobId(runId),
      attempts: AI_AGENTS_DEFAULTS.attempts,
      backoff: AI_AGENTS_DEFAULTS.backoff,
      removeOnComplete: AI_AGENTS_DEFAULTS.removeOnComplete,
      removeOnFail: AI_AGENTS_DEFAULTS.removeOnFail,
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

/**
 * Enqueues a dispute-resolution agent run for the given dispute.
 * Fire-and-forget — errors are swallowed via onError.
 */
export function enqueueDisputeResolution(
  disputeId: string,
  runId: string,
  rerunById?: string | null,
): void {
  const { data, opts } = buildDisputeResolutionJob(disputeId, runId, rerunById)
  addAIAgentJob('dispute-resolution', data, opts).catch(onError)
  trackJobEnqueue(AI_AGENTS_QUEUE_NAME, 'dispute-resolution')
}

/**
 * Awaitable variant for manual staff-triggered re-runs: propagates enqueue failures so the
 * caller can surface an error instead of falsely reporting the job as queued. A job already
 * queued for this run is not an error.
 */
export async function enqueueDisputeResolutionQueued(
  disputeId: string,
  runId: string,
  rerunById?: string | null,
): Promise<void> {
  const { data, opts } = buildDisputeResolutionJob(disputeId, runId, rerunById)
  await addAIAgentJob('dispute-resolution', data, opts)
  trackJobEnqueue(AI_AGENTS_QUEUE_NAME, 'dispute-resolution')
}
