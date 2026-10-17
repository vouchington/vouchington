import { backgroundHandler } from '@queues/background/enqueues/define-handler'
import {
  POST_PUBLICATION_RECONCILE_JOB,
  POST_PUBLICATION_REVIEW_SUCCESSION_AUDIT_JOB,
  POST_PUBLICATION_SHADOW_AUDIT_JOB,
} from '@queues/background/enqueues/post-publication-jobs'
import type { BackgroundJobDefinition } from '@queues/background/types'
import {
  processAuditReviewSuccessionHistory,
  processReconcilePostPublication,
  processShadowAuditPostPublication,
} from './processors.mts'

/** Hands the job's payload to the processor; the processors take injected dependencies second. */
function delegate<TData>(job: BackgroundJobDefinition<TData>, process: (data: TData) => unknown) {
  return backgroundHandler(job, queued => process(queued.data))
}

export const postPublicationHandlers = [
  delegate(POST_PUBLICATION_RECONCILE_JOB, processReconcilePostPublication),
  delegate(POST_PUBLICATION_SHADOW_AUDIT_JOB, processShadowAuditPostPublication),
  delegate(POST_PUBLICATION_REVIEW_SUCCESSION_AUDIT_JOB, processAuditReviewSuccessionHistory),
]
