import type {
  SesInboundProcessJobData,
  SesInboundReconcileJobData,
} from '@ts-shared/ses-inbound-contract'
import { PRIORITY_DISPATCH, PRIORITY_TASK } from '../config.mts'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'

// One group for the whole domain: process and reconcile jobs run one at a time across every
// worker, which also keeps the reconciler a singleton.
export const SES_INBOUND_DOMAIN = defineBackgroundDomain({
  domain: 'ses-inbound',
  group: { kind: 'domain', concurrency: 1 },
  workerConcurrency: 1,
})

export const SES_INBOUND_PROCESS_JOB = defineBackgroundJob<SesInboundProcessJobData>(
  SES_INBOUND_DOMAIN,
  { name: 'process', priority: PRIORITY_TASK },
)

export const SES_INBOUND_RECONCILE_JOB = defineBackgroundJob<SesInboundReconcileJobData>(
  SES_INBOUND_DOMAIN,
  { name: 'reconcile', priority: PRIORITY_DISPATCH },
)

export const SES_INBOUND_JOBS = [SES_INBOUND_PROCESS_JOB, SES_INBOUND_RECONCILE_JOB] as const
