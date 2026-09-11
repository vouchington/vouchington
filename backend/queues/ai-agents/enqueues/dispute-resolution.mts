import type { JobOptions } from 'glide-mq'
import onError from '@modules/on-error'
import { trackJobEnqueue } from '@services/analytics'
import { AI_AGENTS_QUEUE_NAME, AI_AGENTS_DEFAULTS, AGENT_PRIORITY } from '../config.mts'
import { ai_agents } from '../queues.mts'
import type { DisputeResolutionJobData } from '../types.mts'

function buildDisputeResolutionJob(
  disputeId: string,
  rerunById?: string | null,
): { data: DisputeResolutionJobData; opts: JobOptions } {
  return {
    data: {
      dispute_id: disputeId,
      rerun_by_id: rerunById ?? null,
    } satisfies DisputeResolutionJobData,
    opts: {
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
export function enqueueDisputeResolution(disputeId: string, rerunById?: string | null): void {
  const { data, opts } = buildDisputeResolutionJob(disputeId, rerunById)
  ai_agents.add('dispute-resolution', data, opts).catch(onError)
  trackJobEnqueue(AI_AGENTS_QUEUE_NAME, 'dispute-resolution')
}

/**
 * Awaitable variant for manual staff-triggered re-runs: propagates enqueue failures so the
 * caller can surface an error instead of falsely reporting the job as queued.
 */
export async function enqueueDisputeResolutionAndWait(
  disputeId: string,
  rerunById?: string | null,
): Promise<void> {
  const { data, opts } = buildDisputeResolutionJob(disputeId, rerunById)
  await ai_agents.add('dispute-resolution', data, opts)
  trackJobEnqueue(AI_AGENTS_QUEUE_NAME, 'dispute-resolution')
}
