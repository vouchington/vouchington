import { backgroundHandler } from '@queues/background/enqueues/define-handler'
import {
  POST_PUBLICATION_RECONCILE_JOB,
  POST_PUBLICATION_REVIEW_SUCCESSION_AUDIT_JOB,
  POST_PUBLICATION_SHADOW_AUDIT_JOB,
} from '@queues/background/enqueues/post-publication-jobs'
import {
  processAuditReviewSuccessionHistory,
  processReconcilePostPublication,
  processShadowAuditPostPublication,
} from './processors.mts'

export const postPublicationHandlers = [
  backgroundHandler(POST_PUBLICATION_RECONCILE_JOB, job =>
    processReconcilePostPublication(job.data),
  ),
  backgroundHandler(POST_PUBLICATION_SHADOW_AUDIT_JOB, job =>
    processShadowAuditPostPublication(job.data),
  ),
  backgroundHandler(POST_PUBLICATION_REVIEW_SUCCESSION_AUDIT_JOB, job =>
    processAuditReviewSuccessionHistory(job.data),
  ),
]
