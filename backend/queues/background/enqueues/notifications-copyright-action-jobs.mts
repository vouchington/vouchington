import { defineBackgroundJob } from './define-job.mts'
import { DISPATCH, RETRY } from './notifications-job-options.mts'
import {
  NOTIFICATIONS_DOMAIN as DOMAIN,
  type CopyrightActionReconcileData,
  type CopyrightActionReconcileStage,
} from './notifications-domain.mts'

/** One lane bounds the load of every copyright action sweep stage together. */
export const COPYRIGHT_ACTION_RECONCILE_ORDERING = {
  key: 'notifications:copyright-action-reconcile',
} as const

function stageJob(name: string) {
  return defineBackgroundJob<CopyrightActionReconcileData>(DOMAIN, {
    name,
    ...DISPATCH,
    ...RETRY,
    ordering: COPYRIGHT_ACTION_RECONCILE_ORDERING,
  })
}

/** Each stage is its own job with its own cursor, cap, retry and failure. */
export const NOTIFICATIONS_RECONCILE_COPYRIGHT_ACTION_JOBS = {
  forms: stageJob('processReconcileCopyrightFormReviews'),
  decisions: stageJob('processReconcileCopyrightDecisionAssessments'),
  enforcement: stageJob('processReconcileCopyrightEnforcementAssessments'),
  suspended: stageJob('processReconcileCopyrightSuspendedClaimantRestrictions'),
  blocked: stageJob('processReconcileCopyrightBlockedHoldRestorations'),
  restorations: stageJob('processReconcileCopyrightStatutoryRestorations'),
  actions: stageJob('processReconcileCopyrightActionIntents'),
} as const satisfies Record<CopyrightActionReconcileStage, ReturnType<typeof stageJob>>
