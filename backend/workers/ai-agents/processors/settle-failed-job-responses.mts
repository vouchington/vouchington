import type { Job, Queue } from 'glide-mq'
import onError from '@modules/on-error'
import { reconcileBackgroundResponse } from '@services/openai-background-responses'
import type { AIAgentJobData } from '@queues/ai-agents/types'
import pMap from 'p-map'

const RECONCILE_CONCURRENCY = 5

/**
 * Settles each response retained on a failed job once, then drops it from the job's data so a
 * later sweep makes no provider call. Responses that are still active or whose ledger write
 * failed stay on the job and are retried. The payload is re-read after the provider calls and
 * only rewritten while the job is still failed, so an operator retry keeps its own IDs.
 */
export async function settleFailedJobResponses(
  queue: Pick<Queue<AIAgentJobData>, 'getJob'>,
  failedJob: Job<AIAgentJobData>,
): Promise<void> {
  const responses = failedJob.data.backgroundResponses ?? []
  if (responses.length === 0) return
  const mode = failedJob.name === 'recover-background-response' ? 'inline' : 'worker'
  const settled = new Set<string>()
  await pMap(
    responses,
    async response => {
      try {
        const result = await reconcileBackgroundResponse(
          { ...response, createdAt: new Date(response.createdAt) },
          mode,
        )
        if (result !== 'still-active' && result !== 'accounting-uncertain') {
          settled.add(response.responseId)
        }
      } catch (err) {
        reportFailure(err)
      }
    },
    { concurrency: RECONCILE_CONCURRENCY },
  )
  if (settled.size === 0) return
  try {
    const latest = await queue.getJob(failedJob.id)
    if (!latest || (await latest.getState()) !== 'failed') return
    await latest.updateData({
      ...latest.data,
      backgroundResponses: (latest.data.backgroundResponses ?? []).filter(
        response => !settled.has(response.responseId),
      ),
    })
  } catch (err) {
    reportFailure(err)
  }
}

function reportFailure(err: unknown): void {
  onError(
    err instanceof Error
      ? err
      : new Error('Background response reconciliation failed', { cause: err }),
  )
}
