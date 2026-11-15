import { asRecord, assertExactKeys, optionalString } from '@queues/emails/payload/job-payload-read'
import type { EmailDigestDispatcherJobs } from '@queues/emails/types'

export const DISPATCHER_JOB_NAMES = [
  'dispatchEngagementEmails',
  'dispatchCommunityModerationSummaryEmails',
  'dispatchApiKeyExpiryReminders',
] as const satisfies readonly EmailDigestDispatcherJobs[]

/** Paged dispatchers carry the last inspected immutable id in their job data. */
export function dispatcherPayload(
  name: EmailDigestDispatcherJobs,
  data: unknown,
): { afterId?: string } {
  const record = asRecord(data ?? {}, 'payload')
  assertExactKeys(record, name === 'dispatchEngagementEmails' ? [] : ['afterId'])
  optionalString(record, 'afterId')
  return typeof record.afterId === 'string' ? { afterId: record.afterId } : {}
}
