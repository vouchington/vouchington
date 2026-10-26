import type { Job } from 'glide-mq'
import pMap from 'p-map'
import onError from '@modules/on-error'
import { reconcileBackgroundResponse } from '@services/openai-background-responses'
import type { AIAgentJobData, JobBackgroundResponse } from '@queues/ai-agents/types'
import type { BackgroundResponseJobContext } from '@agents/_shared/background-response-job-context'

const RECONCILE_CONCURRENCY = 5
const RECHECK_DELAY_MS = 5 * 60_000

export function createBackgroundResponseJobContext(
  job: Job<AIAgentJobData>,
): BackgroundResponseJobContext {
  let pendingUpdate: Promise<void> = Promise.resolve()
  const update = (change: (responses: JobBackgroundResponse[]) => JobBackgroundResponse[]) => {
    const next = pendingUpdate.then(() => {
      const responses = job.data.backgroundResponses ?? []
      return job.updateData({ ...job.data, backgroundResponses: change(responses) })
    })
    pendingUpdate = next.catch(reportFailedJobDataUpdate)
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

function reportFailedJobDataUpdate(err: unknown): void {
  // The caller receives this rejection too. Keep the serialization tail usable for a later
  // response while retaining a diagnostic if the caller aborts before its own report.
  onError(
    err instanceof Error
      ? err
      : new Error('OpenAI response job data update failed', { cause: err }),
  )
}

/** Settle provider IDs before a replay can dispatch another paid response. */
export async function reconcileJobBackgroundResponses(
  job: Job<AIAgentJobData>,
  context: BackgroundResponseJobContext,
): Promise<void> {
  await settlePersistedBackgroundResponses(job, context)
  if ((job.data.backgroundResponses?.length ?? 0) === 0) return
  await job.moveToDelayed(Date.now() + RECHECK_DELAY_MS)
}

/** Reconciles response IDs already persisted on the current job. */
async function settlePersistedBackgroundResponses(
  job: Job<AIAgentJobData>,
  context: BackgroundResponseJobContext,
): Promise<void> {
  const responses = job.data.backgroundResponses ?? []
  if (responses.length === 0) return
  await pMap(
    responses,
    async response => {
      try {
        const result = await reconcileBackgroundResponse(
          { ...response, createdAt: new Date(response.createdAt) },
          job.name === 'recover-background-response' ? 'inline' : 'worker',
        )
        if (result !== 'still-active' && result !== 'accounting-uncertain') {
          await context.settle(response.responseId)
        }
      } catch (err) {
        onError(
          err instanceof Error
            ? err
            : new Error('Background response job recovery failed', { cause: err }),
        )
      }
    },
    { concurrency: RECONCILE_CONCURRENCY, stopOnError: false },
  )
}

export function assertNoUnsettledBackgroundResponses(job: Job<AIAgentJobData>): void {
  if ((job.data.backgroundResponses?.length ?? 0) === 0) return
  throw new Error(`AI job completed with unsettled OpenAI background responses: ${job.id}`)
}
