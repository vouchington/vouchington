import type {
  SesInboundProcessJobData,
  SesInboundReconcileJobData,
} from '@ts-shared/ses-inbound-contract'
import { PRIORITY_DISPATCH, PRIORITY_TASK } from '../config.mts'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'

// Processing and reconciliation stay serial across every worker process.
export const SES_INBOUND_DOMAIN = defineBackgroundDomain({
  domain: 'ses-inbound',
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
