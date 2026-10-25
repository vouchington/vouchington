import { PRIORITY_DISPATCH } from '../config.mts'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'

export type PostPublicationShadowAuditJobData = { dryRun: boolean; cursor: string | null }

export type ReviewSuccessionHistoryAuditJobData = {
  cursor: string | null
  cutoffArchivedAt: string | null
}

// Reconciliation and audits stay serial across every worker process.
export const POST_PUBLICATION_DOMAIN = defineBackgroundDomain({
  domain: 'post-publication',
  workerConcurrency: 1,
})

export const POST_PUBLICATION_RECONCILE_JOB = defineBackgroundJob(POST_PUBLICATION_DOMAIN, {
  name: 'reconcile',
  priority: PRIORITY_DISPATCH,
})

export const POST_PUBLICATION_SHADOW_AUDIT_JOB =
  defineBackgroundJob<PostPublicationShadowAuditJobData>(POST_PUBLICATION_DOMAIN, {
    name: 'shadow-audit',
    priority: PRIORITY_DISPATCH,
  })

export const POST_PUBLICATION_REVIEW_SUCCESSION_AUDIT_JOB =
  defineBackgroundJob<ReviewSuccessionHistoryAuditJobData>(POST_PUBLICATION_DOMAIN, {
    name: 'audit-review-succession-history',
    priority: PRIORITY_DISPATCH,
  })

export const POST_PUBLICATION_JOBS = [
  POST_PUBLICATION_RECONCILE_JOB,
  POST_PUBLICATION_SHADOW_AUDIT_JOB,
  POST_PUBLICATION_REVIEW_SUCCESSION_AUDIT_JOB,
] as const
