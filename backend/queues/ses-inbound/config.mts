export {
  SES_INBOUND_QUEUE_NAME,
  SES_INBOUND_RECONCILE_JOB_NAME,
} from '@ts-shared/ses-inbound-contract'

export const SES_INBOUND_RECONCILE_INTERVAL_MS = 5 * 60_000
export const SES_INBOUND_RECONCILE_PRIORITY = 100
export const SES_INBOUND_RECONCILE_ORDERING = {
  key: 'ses-inbound-reconciliation',
  concurrency: 1,
} as const
