import { PRIORITY_DISPATCH } from '../config.mts'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'

export type PostPublicationShadowAuditJobData = { dryRun: boolean; cursor: string | null }

export type ReviewSuccessionHistoryAuditJobData = {
  cursor: string | null
  cutoffArchivedAt: string | null
}

// Every job of the old queue carried the one `publication-reconciliation` key with concurrency 1,
// so one group for the whole domain keeps reconciliation and its audits strictly serial across
// every worker. All jobs are dispatcher-tier, so there are no further priority tiers to keep.
export const POST_PUBLICATION_DOMAIN = defineBackgroundDomain({
  domain: 'post-publication',
  group: { kind: 'domain', concurrency: 1 },
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
