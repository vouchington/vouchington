import { backgroundHandler } from '@queues/background/enqueues/define-handler'
import {
  POST_PUBLICATION_EFFECTS_JOB,
  POST_PUBLICATION_REVIEW_SUCCESSION_AUDIT_JOB,
} from '@queues/background/enqueues/post-publication-jobs'
import type { BackgroundJobDefinition } from '@queues/background/types'
import { processAuditReviewSuccessionHistory } from './processors/review-succession-history.mts'
import { processApplyPostPublicationEffects } from './processors/direct-effects.mts'

/** Hands the job's payload to the processor; the processors take injected dependencies second. */
function delegate<TData>(job: BackgroundJobDefinition<TData>, process: (data: TData) => unknown) {
  return backgroundHandler(job, queued => process(queued.data))
}

export const postPublicationHandlers = [
  delegate(POST_PUBLICATION_EFFECTS_JOB, processApplyPostPublicationEffects),
  delegate(POST_PUBLICATION_REVIEW_SUCCESSION_AUDIT_JOB, processAuditReviewSuccessionHistory),
]
