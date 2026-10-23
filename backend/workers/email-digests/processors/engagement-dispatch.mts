import { processPagedDispatcher } from '@data-stores/valkey-glide-mq/paged-dispatcher'
import { background } from '@queues/background/queues'
import type { EngagementDispatchData } from '@queues/background/enqueues/email-digests-domain'
import type { BackgroundHandler } from '@queues/background/types'
import { enqueueEngagementDispatchContinuation } from '@queues/email-digests/enqueues'
import {
  dispatchEngagementRecipientPage,
  prepareEngagementRecipientPage,
} from '@services/engagement-emails/dispatch-engagement-emails'
import { getEngagementEmailsWorkLimit } from '@services/engagement-emails/work-limits'

const PHASES = ['follow_topics', 'post_referral_link', 'follow_news_sources'] as const

function nextPhase(phase: (typeof PHASES)[number]): (typeof PHASES)[number] | undefined {
  const index = PHASES.indexOf(phase)
  return PHASES[index + 1]
}

export async function processEngagementDispatchJob(
  job: Parameters<BackgroundHandler<EngagementDispatchData>['handle']>[0],
) {
  const phase = job.data.phase ?? 'follow_topics'
  if (!PHASES.includes(phase)) throw new TypeError('Invalid engagement dispatch phase')
  const startedAt = job.data.dispatchStartedAt ?? new Date().toISOString()
  const dispatchStartedAt = new Date(startedAt)
  if (!Number.isFinite(dispatchStartedAt.getTime()))
    throw new TypeError('Invalid engagement dispatch start time')
  const remainingBudget =
    job.data.remainingBudget ?? getEngagementEmailsWorkLimit('dispatch_batch_size')
  if (!Number.isSafeInteger(remainingBudget) || remainingBudget < 1 || remainingBudget > 2_500)
    throw new TypeError('Invalid engagement dispatch remaining budget')
  if (!job.data.phase || !job.data.dispatchStartedAt || job.data.remainingBudget === undefined)
    await job.updateData({ ...job.data, phase, dispatchStartedAt: startedAt, remainingBudget })

  return processPagedDispatcher(job, {
    dispatcher: 'engagement',
    cursorKey: 'phase,claim,userId',
    target: background,
    targetName: 'background',
    readAndDispatch: async rawLimit => {
      let preparedPage = job.data.preparedPage
      if (!preparedPage) {
        preparedPage = await prepareEngagementRecipientPage({
          type: phase,
          dispatchStartedAt,
          cursor: job.data.cursor,
          rawLimit,
          remainingBudget,
        })
        // Persist selected identifiers before the first claim. A failed or ambiguous queue add
        // must replay the same page even though claiming moves rows out of the unclaimed lane.
        await job.updateData({ ...job.data, preparedPage })
      }
      const result = await dispatchEngagementRecipientPage({
        type: phase,
        dispatchStartedAt,
        preparedPage,
        ownerJobId: job.id,
        remainingBudget,
      })
      const nextBudget = remainingBudget - result.count
      let next: EngagementDispatchData | undefined
      if (result.nextCursor && nextBudget > 0)
        next = {
          phase,
          cursor: result.nextCursor,
          dispatchStartedAt: startedAt,
          remainingBudget: nextBudget,
        }
      else {
        const following = nextPhase(phase)
        if (following)
          next = {
            phase: following,
            dispatchStartedAt: startedAt,
            remainingBudget: getEngagementEmailsWorkLimit('dispatch_batch_size'),
          }
      }
      return { result, ...(next && { next }) }
    },
    enqueueNext: enqueueEngagementDispatchContinuation,
  })
}
