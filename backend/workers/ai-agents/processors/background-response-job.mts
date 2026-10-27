import type { Job } from 'glide-mq'
import pMap from 'p-map'
import onError from '@modules/on-error'
import { reconcileBackgroundResponse } from '@services/openai-background-responses'
import type { AIAgentJobData, JobBackgroundResponse } from '@queues/ai-agents/types'
import type { BackgroundResponseJobContext } from '@agents/_shared/background-response-job-context'

const RECONCILE_CONCURRENCY = 5
const RECHECK_DELAY_MS = 5 * 60_000

/** Saves each provider response id in the job's own data so a retry can find it. */
export function createBackgroundResponseJobContext(
  job: Job<AIAgentJobData>,
): BackgroundResponseJobContext {
  let pendingUpdate: Promise<void> = Promise.resolve()
  const update = (change: (responses: JobBackgroundResponse[]) => JobBackgroundResponse[]) => {
    const next = pendingUpdate.then(() =>
      job.updateData({
        ...job.data,
        backgroundResponses: change(job.data.backgroundResponses ?? []),
      }),
    )
    pendingUpdate = next.catch(onError)
    return next
  }
  return {
    register: response =>
      update(responses =>
        responses.some(existing => existing.responseId === response.responseId)
          ? responses
          : [...responses, response],
      ),
    settle: responseId =>
      update(responses => responses.filter(response => response.responseId !== responseId)),
  }
}

/**
 * Checks the response ids saved on a job before it can replay a paid call. Returns true for the
 * delayed inline-call recovery job, which does nothing else: it observes its original call and
 * rechecks later while that call is still running.
 */
export async function recoverJobBackgroundResponses(
  job: Job<AIAgentJobData>,
  context: BackgroundResponseJobContext,
): Promise<boolean> {
  const inline = job.name === 'recover-background-response'
  const active = await pMap(
    job.data.backgroundResponses ?? [],
    async response => {
      const result = await reconcileBackgroundResponse(
        { ...response, createdAt: new Date(response.createdAt) },
        inline ? 'inline' : 'worker',
      )
      if (result === 'settled') await context.settle(response.responseId)
      return result === 'still-active'
    },
    { concurrency: RECONCILE_CONCURRENCY },
  )
  if (inline && active.includes(true)) await job.moveToDelayed(Date.now() + RECHECK_DELAY_MS)
  return inline
}
